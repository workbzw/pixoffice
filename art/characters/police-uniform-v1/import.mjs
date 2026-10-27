import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { measureFrame } from '../../../scripts/characters/standard.mjs'
import { createQualityDraft } from '../../../scripts/characters/quality-cli.mjs'

const root = path.resolve(import.meta.dirname, '../../..')
const staging = path.resolve(root, process.env.POLICE_STAGING_ROOT ?? '.character-staging/civic-seating-v10-final')
const seating = JSON.parse(await readFile(new URL('./seating-v10.json', import.meta.url), 'utf8'))
const ids = ['office-lead', 'code-agent', 'file-agent', 'app-agent', 'review-agent', 'data-agent']
const slots = [
  ['idle.front', 0], ['idle.right', 0], ['idle.back', 0], ['sit.back', 0], ['pose.lean', 0], ['pose.rise', 0],
  ['walk.front', 0], ['walk.front', 1], ['walk.front', 2], ['walk.front', 3], ['talk.seated-right', 0], ['emote.wave', 0],
  ['walk.back', 0], ['walk.back', 1], ['walk.back', 2], ['walk.back', 3], ['emote.thinking', 0], ['emote.surprised', 0],
  ['walk.right', 0], ['walk.right', 1], ['walk.right', 2], ['walk.right', 3], ['work.quiet-back', 0], ['work.quiet-back', 1],
  ['run.back', 0], ['run.back', 1], ['run.back', 2], ['run.back', 3], ['work.quiet-back', 2], ['work.quiet-back', 3],
]
const encode = value => JSON.stringify(value, null, 2) + '\n'
const fingerRegions = [{ x: 48, y: 236, width: 48, height: 40 }, { x: 160, y: 236, width: 48, height: 40 }]
const wholeWorkSheets = {
  'data-agent': {
    source: 'data-agent-work-v7.png', headBottom: 534,
    fingers: [{ x: 38, y: 236, width: 32, height: 25 }, { x: 186, y: 236, width: 32, height: 25 }],
  },
}
const frontBackHeads = {
  'office-lead': [267, 267, 267, 267, 211, 211, 211, 211],
  'code-agent': [269, 269, 269, 269, 245, 245, 245, 245],
  'file-agent': [301, 301, 304, 301, 220, 220, 220, 220],
  'app-agent': [295, 295, 295, 295, 259, 259, 259, 259],
  'review-agent': [286, 286, 286, 286, 220, 220, 220, 220],
  'data-agent': [289, 289, 289, 289, 238, 238, 238, 238],
}
const singleViewHeads = {
  'file-agent': { front: [358, 358, 378, 378], back: [410, 410, 410, 410] },
  'app-agent': { back: [430, 430, 422, 422] },
}
// Include the complete side hair silhouette, especially the auburn character's ends.
const sideWalkHeads = {
  'office-lead': [340, 340, 312, 312],
  'code-agent': [367, 367, 344, 344],
  'file-agent': [332, 332, 304, 304],
  'app-agent': [435, 435, 396, 396],
  'review-agent': [344, 344, 319, 319],
  'data-agent': [384, 384, 354, 354],
}
// Whole-frame registration only; keep every sole within the existing 344 +/- 2 rule.
const sideWalkOffsets = {
  'office-lead': [0, 0, 0, 1],
  'file-agent': [0, 2, 0, 0],
  'app-agent': [2, 2, -2, -2],
  'data-agent': [1, 1, 0, 0],
}

async function isolateSprite(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const count = info.width * info.height, labels = new Int32Array(count), queue = new Int32Array(count)
  let component = 0, largest = 0, largestSize = 0
  for (let start = 0; start < count; start++) {
    if (labels[start] || data[start * 4 + 3] < 16) continue
    let head = 0, tail = 1
    queue[0] = start; labels[start] = ++component
    while (head < tail) {
      const at = queue[head++], x = at % info.width, y = Math.floor(at / info.width)
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, next = ny * info.width + nx
        if (nx < 0 || ny < 0 || nx >= info.width || ny >= info.height || labels[next] || data[next * 4 + 3] < 16) continue
        labels[next] = component; queue[tail++] = next
      }
    }
    if (tail > largestSize) { largest = component; largestSize = tail }
  }
  // Remove disconnected generation debris while retaining the body's soft alpha fringe.
  const keep = new Uint8Array(count)
  for (let at = 0; at < count; at++) if (labels[at] === largest) {
    const x = at % info.width, y = Math.floor(at / info.width)
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (x + dx >= 0 && x + dx < info.width && y + dy >= 0 && y + dy < info.height) keep[(y + dy) * info.width + x + dx] = 1
    }
  }
  for (let at = 0; at < count; at++) if (!keep[at]) data.fill(0, at * 4, at * 4 + 4)
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer()
}

async function place(buffer, x, y) {
  const { width, height } = await sharp(buffer).metadata()
  const left = Math.max(0, -x), top = Math.max(0, -y)
  const w = Math.min(width - left, 256 - Math.max(0, x)), h = Math.min(height - top, 384 - Math.max(0, y))
  if (w <= 0 || h <= 0) throw new Error('Registration is outside the character canvas')
  return sharp({ create: { width: 256, height: 384, channels: 4, background: '#00000000' } })
    .composite([{ input: await sharp(buffer).extract({ left, top, width: w, height: h }).png().toBuffer(), left: Math.max(0, x), top: Math.max(0, y) }]).png().toBuffer()
}

function landmarks(source, standard, name, index) {
  const file = source.clips[name].frames[index].file
  const existing = standard.frames[file]
  if (existing) return { ...existing }
  return { view: name.endsWith('.back') ? 'back' : 'front', headTop: 0, headBottom: name.endsWith('.back') ? standard.frames[source.clips['idle.back'].frames[0].file].headBottom : standard.frames[source.clips['idle.front'].frames[0].file].headBottom, footY: 344 }
}

async function importCharacter(id) {
  const correction = seating.characters[id]
  const workFingerRegions = (wholeWorkSheets[id]?.fingers ?? fingerRegions).map(region => ({
    x: Math.round(128 + (region.x - 128) * correction.scale),
    y: Math.round(377 + (region.y - 377) * correction.scale),
    width: Math.round(region.width * correction.scale), height: Math.round(region.height * correction.scale),
  }))
  const directory = path.join(staging, id)
  await mkdir(staging, { recursive: true })
  await mkdir(directory)
  const original = path.join(root, 'art/characters/packs', id)
  const source = JSON.parse(await readFile(path.join(original, 'character.json'), 'utf8'))
  const oldStandard = JSON.parse(await readFile(path.join(original, 'standard.json'), 'utf8'))
  const sheet = path.join(import.meta.dirname, 'sources', `${id}.png`)
  const metadata = await sharp(sheet).metadata()
  const baseScale = 1536 / metadata.width
  const cells = []
  for (const [i, [name, index]] of slots.entries()) {
    const left = Math.round(i % 6 * metadata.width / 6), top = Math.round(Math.floor(i / 6) * metadata.height / 5)
    const width = Math.floor(metadata.width / 6)
    const height = Math.floor(metadata.height / 5)
    const bytes = await isolateSprite(await sharp(sheet).extract({ left, top, width, height }).png().toBuffer())
    const authored = landmarks(source, oldStandard, name, index)
    const band = { headTop: Math.floor(authored.headTop / baseScale), headBottom: Math.ceil(authored.headBottom / baseScale) }
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    cells.push({ name, index, bytes, width, height, authored, band, crop: { left, top, width, height }, measured: measureFrame(data, info.width, info.height, band) })
  }
  // References belong to these police standing masters, not to the old costume pack.
  const references = Object.fromEntries(cells.slice(0, 3).map(cell => [cell.authored.view, cell.measured.headArea * (baseScale * correction.scale) ** 2]))
  for (const [kind, count] of [['transition', 6], ['gait', 4]]) {
    const sourceName = kind === 'transition' ? correction.transitionSource : `${id}-sidewalk-v8.png`
    const image = path.join(import.meta.dirname, 'sources', sourceName)
    const meta = await sharp(image).metadata()
    for (let index = 0; index < count; index++) {
      const columns = kind === 'transition' ? 3 : 2
      const left = Math.round(index % columns * meta.width / columns)
      const top = Math.round(Math.floor(index / columns) * meta.height / 2)
      const width = Math.floor(meta.width / columns)
      const height = Math.floor(meta.height / 2)
      const bytes = await isolateSprite(await sharp(image).extract({ left, top, width, height }).png().toBuffer())
      const band = { headTop: 0, headBottom: kind === 'transition' ? correction.headBottoms[index] : sideWalkHeads[id][index] }
      const name = kind === 'gait' ? 'walk.right' : index === 0 ? 'sit.back' : index === 5 ? 'idle.back' : `pose.rise-${index}`
      const authored = { view: kind === 'gait' ? 'right' : 'back', footY: kind === 'gait' ? 344 : Math.round(377 - index * 33 / 5) }
      const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      const cell = { name, index: kind === 'gait' ? index : 0, bytes, width, height, authored, band,
        source: `sources/${sourceName}`, crop: { left, top, width, height }, measured: measureFrame(data, info.width, info.height, band) }
      const previous = cells.findIndex(item => item.name === name && item.index === cell.index)
      if (previous < 0) cells.push(cell)
      else cells[previous] = cell
    }
  }
  {
    const image = path.join(import.meta.dirname, 'sources', `${id}-frontback-v6.png`)
    if (!singleViewHeads[id]?.front || !singleViewHeads[id]?.back) {
      const meta = await sharp(image).metadata()
      if (meta.width !== 1536 || meta.height !== 1024) throw new Error(`${id}: unexpected front/back sheet dimensions`)
    }
    for (let pose = 0; pose < 8; pose++) {
      const view = pose < 4 ? 'front' : 'back', name = `walk.${view}`, index = pose % 4
      const single = singleViewHeads[id]?.[view]
      const sourceName = single ? `${id}-${view}-arms-v6.png` : `${id}-frontback-v6.png`
      const crop = single
        ? { left: index % 2 * 512, top: Math.floor(index / 2) * 768, width: 512, height: 768 }
        : { left: index * 384, top: Math.floor(pose / 4) * 512, width: 384, height: 512 }
      const bytes = await isolateSprite(await sharp(path.join(import.meta.dirname, 'sources', sourceName)).extract(crop).png().toBuffer())
      const band = { headTop: 0, headBottom: single?.[index] ?? frontBackHeads[id][pose] }
      const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      cells[cells.findIndex(cell => cell.name === name && cell.index === index)] = {
        name, index, bytes, width: crop.width, height: crop.height, authored: { view, footY: 344 }, band,
        source: `sources/${sourceName}`, crop, measured: measureFrame(data, info.width, info.height, band),
      }
    }
  }
  const wholeWork = wholeWorkSheets[id]
  if (wholeWork) {
    const image = path.join(import.meta.dirname, 'sources', wholeWork.source)
    const meta = await sharp(image).metadata()
    if (meta.width !== 1024 || meta.height !== 1536) throw new Error(`${id}: unexpected work sheet dimensions`)
    for (let index = 0; index < 4; index++) {
      const crop = { left: index % 2 * 512, top: Math.floor(index / 2) * 768, width: 512, height: 768 }
      const bytes = await isolateSprite(await sharp(image).extract(crop).png().toBuffer())
      const band = { headTop: 0, headBottom: wholeWork.headBottom }
      const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      const name = 'work.quiet-back'
      cells[cells.findIndex(cell => cell.name === name && cell.index === index)] = {
        name, index, bytes, width: crop.width, height: crop.height, authored: { view: 'back', footY: 377 }, band,
        source: `sources/${wholeWork.source}`, crop, measured: measureFrame(data, info.width, info.height, band),
      }
    }
  }
  const active = cells.filter(cell => !['pose.lean', 'pose.rise', 'run.back'].includes(cell.name))
  const groups = new Map()
  for (const cell of active) {
    const group = ['idle.back', 'sit.back'].includes(cell.name) || cell.name.startsWith('pose.rise-') ? 'back-transition' : cell.name
    cell.group = group
    groups.set(group, [...groups.get(group) ?? [], cell])
  }
  const scales = new Map([...groups].map(([group, list]) => {
    const average = list.reduce((sum, cell) => sum + cell.measured.headArea, 0) / list.length
    const reference = group === 'back-transition' ? list.find(cell => cell.name === 'idle.back').measured.headArea : average
    return [group, Math.sqrt(references[list[0].authored.view] / reference) * (group === 'walk.right' ? correction.walkScale ?? 1 : 1)]
  }))
  await mkdir(path.join(directory, 'frames'), { recursive: true })
  const frames = {}, registrations = {}, provenance = [], clips = {}
  let workRegistration
  for (const cell of active) {
    const scale = scales.get(cell.group)
    const width = Math.round(cell.width * scale)
    const actualScale = width / cell.width
    const bytes = await sharp(cell.bytes).resize({ width }).png().toBuffer()
    const band = { headTop: Math.floor(cell.band.headTop * actualScale), headBottom: Math.ceil(cell.band.headBottom * actualScale) }
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const measured = measureFrame(data, info.width, info.height, band)
    let x = Math.round(128 - measured.headCenter)
    let y = cell.authored.footY - measured.footY + (cell.name === 'walk.right' ? sideWalkOffsets[id]?.[cell.index] ?? 0 : 0)
    if (wholeWork && cell.name === 'work.quiet-back') {
      workRegistration ??= { x, y }
      x = workRegistration.x
      y = workRegistration.y
    }
    cell.file = `frames/${cell.name.replaceAll('.', '-')}-${cell.index + 1}.png`
    cell.output = await place(bytes, x, y)
    cell.registration = { scale: actualScale, x, y }
    cell.headAnchor = { x: measured.headCenter + x, y: measured.headTop + y }
    frames[cell.file] = { view: cell.authored.view, headTop: Math.max(0, band.headTop + y), headBottom: Math.min(384, band.headBottom + y), footY: cell.authored.footY }
    registrations[cell.file] = cell.registration
    provenance.push({ file: cell.file, source: cell.source ?? `sources/${id}.png`, crop: cell.crop, ...cell.registration })
  }
  // Older preview sheets retain their previous processing; repaired work uses whole frames.
  const work = active.filter(cell => cell.name === 'work.quiet-back')
  for (const cell of wholeWork ? [] : work.slice(1)) {
    const base = await sharp(work[0].output).ensureAlpha().raw().toBuffer()
    const current = await sharp(cell.output).ensureAlpha().raw().toBuffer()
    for (const region of workFingerRegions) for (let y = region.y; y < region.y + region.height; y++) {
      const start = (y * 256 + region.x) * 4
      current.copy(base, start, start, start + region.width * 4)
    }
    cell.output = await sharp(base, { raw: { width: 256, height: 384, channels: 4 } }).png().toBuffer()
    frames[cell.file] = { ...frames[work[0].file] }
    registrations[cell.file] = { ...registrations[work[0].file] }
  }
  for (const cell of active) {
    await writeFile(path.join(directory, cell.file), cell.output)
    const clip = clips[cell.name] ??= { frames: [], loop: /^(walk|run|work)\./.test(cell.name) }
    const originalFrame = source.clips[cell.name]?.frames[cell.index] ?? {}
    const durationMs = /^(walk|run)\./.test(cell.name) ? 200 : cell.name.startsWith('work.') ? 250 : 1000
    let mouth = originalFrame.mouth && {
      ...originalFrame.mouth,
      x: originalFrame.mouth.x * cell.registration.scale / baseScale + cell.registration.x,
      y: originalFrame.mouth.y * cell.registration.scale / baseScale + cell.registration.y,
      scale: (originalFrame.mouth.scale ?? 1) * cell.registration.scale / baseScale,
    }
    if (cell.name === 'walk.right' || cell.name === 'walk.front') {
      const idleName = `idle.${cell.authored.view}`
      const standing = active.find(item => item.name === idleName)
      const standingMouth = clips[idleName].frames[0].mouth
      if (!standingMouth) throw new Error(`${id}: side walking requires a registered standing mouth anchor`)
      // These heads are authored from the police standing master, not the old walk sheet.
      mouth = { ...standingMouth,
        x: standingMouth.x + cell.headAnchor.x - standing.headAnchor.x,
        y: standingMouth.y + cell.headAnchor.y - standing.headAnchor.y,
      }
    }
    clip.frames.push({ file: cell.file, durationMs, ...(mouth ? { mouth } : {}) })
  }
  clips['idle.left'] = { alias: 'idle.right', mirrorX: true }
  clips['walk.left'] = { alias: 'walk.right', mirrorX: true }
  clips['run.back'] = { alias: 'walk.back', mirrorX: false }
  clips['talk.seated-left'] = { alias: 'talk.seated-right', mirrorX: true }
  clips['pose.lean'] = { alias: 'pose.rise-1', mirrorX: false }
  clips['pose.rise'] = { alias: 'pose.rise-3', mirrorX: false }
  // A desk-ready idle uses the complete neutral work frame, so starting work cannot move the head or hips.
  clips['sit.back'] = { frames: [{ file: clips['work.quiet-back'].frames[0].file, durationMs: 1000 }], loop: false }
  const seated = ['sit.back', 'pose.rise-1', 'pose.rise-2', 'pose.rise-3', 'pose.rise-4', 'idle.back'].map((name, i) => ({ file: clips[name].frames[0].file, durationMs: [52, 94, 94, 94, 124, 62][i] }))
  clips['stand-up.back'] = { frames: seated, loop: false }
  clips['sit-down.back'] = { frames: [...seated].reverse(), loop: false }
  clips['work.typing-back'] = { alias: 'work.quiet-back', mirrorX: false }
  for (const [name, originalClip] of Object.entries(source.clips)) {
    if (!name.startsWith('mouth.') && !name.startsWith('speak.')) continue
    clips[name] = structuredClone(originalClip)
    for (const frame of originalClip.frames ?? []) {
      const target = path.join(directory, frame.file)
      await mkdir(path.dirname(target), { recursive: true })
      await copyFile(path.join(original, frame.file), target)
      registrations[frame.file] = { scale: 1, x: 0, y: 0 }
    }
  }
  const result = { schemaVersion: 1, id: source.id, label: source.label, profile: source.profile, canvas: source.canvas, pivot: source.pivot, referenceHeight: source.referenceHeight, displayHeight: source.displayHeight, portrait: source.portrait, mouth: source.mouth, clips }
  const views = {}
  for (const cell of active.filter(cell => cell.name.startsWith('idle.'))) {
    const { data, info } = await sharp(cell.output).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const measured = measureFrame(data, info.width, info.height, frames[cell.file])
    views[cell.authored.view] = { headWidth: measured.headWidth, headHeight: measured.headHeight, headArea: measured.headArea }
  }
  await writeFile(path.join(directory, 'character.json'), encode(result))
  await writeFile(path.join(directory, 'standard.json'), encode({ schemaVersion: 1, canvas: source.canvas, pivot: source.pivot, referenceHeight: source.referenceHeight, displayHeight: source.displayHeight, tolerance: { headWidth: 14, headHeight: 16, headCenter: 2, foot: 2, headAreaRatio: .035 }, views, requiredClips: Object.keys(clips).filter(name => !name.startsWith('mouth.')), frames }))
  await writeFile(path.join(directory, 'registration-source.json'), encode(provenance))
  await createQualityDraft(directory)
  const qualityFile = path.join(directory, 'quality.json')
  const quality = JSON.parse(await readFile(qualityFile, 'utf8'))
  quality.registrations = registrations
  for (const [name, action] of Object.entries(quality.actions)) if (name.startsWith('work.')) action.changes = workFingerRegions
  await writeFile(qualityFile, encode(quality))
  const contact = active.map((cell, i) => ({ input: cell.output, left: i % 6 * 256, top: Math.floor(i / 6) * 384 }))
  await sharp({ create: { width: 1536, height: Math.ceil(active.length / 6) * 384, channels: 4, background: '#00000000' } }).composite(contact).png().toFile(path.join(directory, 'contact.png'))
  console.log(`Prepared ${id}: ${directory}`)
}

for (const id of process.argv.slice(2).length ? process.argv.slice(2) : ids) {
  if (!ids.includes(id)) throw new Error(`Unknown costume identity: ${id}`)
  await importCharacter(id)
}
