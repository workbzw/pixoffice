import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { rejectLegacyPublication } from './legacy-authoring.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { measureFrame, validateCharacterStandard } from './standard.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const art = path.join(root, 'art/characters/office-motion-v2')
const json = value => JSON.stringify(value, null, 2) + '\n'

async function pixels(input) {
  return sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
}

function opaqueBounds({ data, info }) {
  let left = info.width, top = info.height, right = -1, bottom = -1
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] < 128) continue
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
  }
  if (right < left) throw new Error('Empty source cell')
  left = Math.max(0, left - 3); top = Math.max(0, top - 3)
  return { left, top, width: Math.min(info.width - left, right - left + 4), height: Math.min(info.height - top, bottom - top + 4) }
}

async function rowCells(file, top, height) {
  const row = await sharp(file).extract({ left: 0, top, width: 1448, height }).png().toBuffer()
  const { data, info } = await pixels(row)
  const spans = []
  for (let x = 0; x < info.width; x++) {
    let count = 0
    for (let y = 0; y < info.height; y++) if (data[(y * info.width + x) * 4 + 3] >= 128) count++
    if (count < 8) continue
    const previous = spans.at(-1)
    if (previous && x - previous.right <= 8) previous.right = x
    else spans.push({ left: x, right: x })
  }
  const bodies = spans.filter(span => span.right - span.left > 100)
  if (bodies.length !== 4) throw new Error(`Expected four isolated sprites: ${file}, row ${top}`)
  return Promise.all(bodies.map(span => sharp(row).extract({ left: Math.max(0, span.left - 3), top: 0,
    width: Math.min(info.width - Math.max(0, span.left - 3), span.right - span.left + 7), height }).png().toBuffer()))
}

async function register(input, headBottom, target, canvas, pivot, footY, mouth) {
  const raw = await pixels(input)
  const measured = measureFrame(raw.data, raw.info.width, raw.info.height, { headTop: 0, headBottom })
  // Uniform optical registration: preserve aspect ratio, match the whole head's visible area.
  const scale = Math.sqrt(target.headArea / measured.headArea)
  const crop = opaqueBounds(raw)
  const width = Math.round(crop.width * scale), height = Math.round(crop.height * scale)
  const sx = width / crop.width, sy = height / crop.height
  const left = Math.round(pivot.x - (measured.headCenter - crop.left + .5) * sx + .5)
  const top = Math.round(footY - (measured.footY - crop.top) * sy)
  if (left <= 0 || top <= 0 || left + width >= canvas.width || top + height >= canvas.height) throw new Error('Registered frame exceeds canvas')
  const image = await sharp(input).extract(crop).resize(width, height).png().toBuffer()
  const buffer = await sharp({ create: { ...canvas, channels: 4, background: '#00000000' } }).composite([{ input: image, left, top }]).png().toBuffer()
  const rule = { headTop: top, headBottom: Math.round(top + (headBottom - crop.top) * sy), footY }
  return { buffer, rule, mouth: mouth && { ...mouth, x: left + (mouth.x - crop.left) * sx, y: top + (mouth.y - crop.top) * sy, scale: (mouth.scale ?? 1) * scale } }
}

export async function registerOfficeMotion() {
  rejectLegacyPublication()
  const recipe = JSON.parse(await readFile(path.join(art, 'registration.json'), 'utf8'))
  const prepared = []
  for (const [id, landmarks] of Object.entries(recipe)) {
    const directory = path.join(root, 'art/characters/packs', id)
    const source = JSON.parse(await readFile(path.join(art, 'source-manifests', `${id}.json`), 'utf8'))
    const standard = { schemaVersion: 1, canvas: source.canvas, pivot: source.pivot, referenceHeight: source.referenceHeight, displayHeight: source.displayHeight,
      tolerance: { headWidth: 14, headCenter: 2, foot: 2, headAreaRatio: .035, headHeight: 16 }, views: {}, requiredClips: [], frames: {} }
    const outputs = new Map()
    for (const view of ['front', 'back', 'right']) {
      const file = source.clips[`idle.${view}`].frames[0].file
      const raw = await pixels(path.join(directory, file))
      const measured = measureFrame(raw.data, raw.info.width, raw.info.height, { headTop: 0, headBottom: landmarks.referenceBottom[view] })
      standard.views[view] = { headWidth: measured.headWidth, headHeight: measured.headHeight, headArea: measured.headArea }
    }
    for (const [row, view] of ['front', 'back'].entries()) {
      const frames = []
      const cells = await rowCells(path.join(art, `${id}.png`), row ? 552 : 0, row ? 534 : 552)
      for (let index = 0; index < 4; index++) {
        let input = cells[index]
        let headBottom = landmarks.walkBottom[row] - (row ? 552 : 0)
        let mouthY = landmarks.mouthY
        // The two rejected contact frames were corrected by ImageGen as separate full-body assets.
        if (row === 0 && index === 2 && ['file-agent', 'app-agent'].includes(id)) {
          const isFile = id === 'file-agent'
          input = await sharp(path.join(art, 'opposite-contact.png')).extract({ left: isFile ? 0 : 724, top: 0, width: 724, height: 1086 }).png().toBuffer()
          headBottom = isFile ? 558 : 654
          mouthY = isFile ? 516 : 500
        }
        const raw = await pixels(input)
        const head = measureFrame(raw.data, raw.info.width, raw.info.height, { headTop: 0, headBottom })
        const result = await register(input, headBottom, standard.views[view], source.canvas, source.pivot, 344,
          view === 'front' ? { x: head.headCenter, y: mouthY, view, scale: 1 / Math.sqrt(standard.views[view].headArea / head.headArea), rotation: 0 } : undefined)
        const file = `standard-v2/walk/${view}/${String(index + 1).padStart(3, '0')}.png`
        outputs.set(file, result.buffer)
        frames.push({ file, durationMs: 200, ...(result.mouth ? { mouth: result.mouth } : {}) })
        standard.frames[file] = { view, ...result.rule }
      }
      source.clips[`walk.${view}`] = { frames, loop: true }
    }
    const replacements = new Map()
    for (const [index, name] of ['sit.back', 'pose.lean', 'pose.rise', 'talk.seated-right'].entries()) {
      const old = source.clips[name].frames[0], view = index === 3 ? 'right' : 'back'
      const input = await readFile(path.join(directory, old.file))
      const result = await register(input, landmarks.seatBottom[index], standard.views[view], source.canvas, source.pivot, [377, 371, 354, 377][index], old.mouth)
      const file = `standard-v2/${name.replaceAll('.', '/')}/001.png`
      outputs.set(file, result.buffer)
      replacements.set(old.file, { file, mouth: result.mouth })
      standard.frames[file] = { view, ...result.rule }
      // Long hair spreads during the forward lean; visible head area still has the same strict check.
      if (id === 'app-agent' && name.startsWith('pose.')) standard.frames[file].headWidthTolerance = 24
    }
    for (const [name, clip] of Object.entries(source.clips)) {
      if (!name.startsWith('archive-') && !name.startsWith('emote.') && !name.startsWith('run.') && !name.startsWith('mouth.')) standard.requiredClips.push(name)
      if (!('frames' in clip) || !standard.requiredClips.includes(name)) continue
      for (const frame of clip.frames) {
        const replacement = replacements.get(frame.file)
        if (replacement) {
          frame.file = replacement.file
          if (replacement.mouth) frame.mouth = replacement.mouth
        }
        if (!standard.frames[frame.file]) {
          const view = name.endsWith('back') ? 'back' : name.endsWith('front') ? 'front' : 'right'
          standard.frames[frame.file] = { view, headTop: 0, headBottom: landmarks.referenceBottom[view], footY: 344 }
        }
      }
    }
    // Match lateral preview cadence too; body artwork and mirrored aliases stay unchanged.
    source.clips['walk.right'].frames.forEach(frame => { frame.durationMs = 200 })
    const buffers = new Map(outputs)
    for (const file of Object.keys(standard.frames)) {
      if (!buffers.has(file)) buffers.set(file, await readFile(path.join(directory, file)))
    }
    const measured = await validateCharacterStandard(directory, source, buffers, standard)
    prepared.push({ id, directory, source, standard, outputs, measured })
  }
  // Preflight every resident before publishing any active metadata or image.
  for (const { id, directory, source, standard, outputs, measured } of prepared) {
    for (const [file, buffer] of outputs) {
      await mkdir(path.dirname(path.join(directory, file)), { recursive: true })
      await writeFile(path.join(directory, file), buffer)
    }
    await writeFile(path.join(directory, 'standard.json'), json(standard))
    await writeFile(path.join(directory, 'character.json'), json(source))
    console.log(`${id}: ${measured.length} active frames registered and verified`)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await registerOfficeMotion()
