import { readFile, mkdir, writeFile, cp, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

// One-time import of reviewed originals. Normal builds consume the registered files below.
const root = fileURLToPath(new URL('../../', import.meta.url))
const outputDirectory = path.join(root, 'art/farm/character')
const directory = await mkdtemp(path.join(tmpdir(), 'pixoffice-farm-character-'))
const sourceRoot = path.join(root, 'art/characters/packs/marvis')
const original = JSON.parse(await readFile(path.join(sourceRoot, 'character.json'), 'utf8'))
const clips = {}
function include(name) {
  if (clips[name]) return
  const clip = original.clips[name]
  if (!clip) throw new Error(`Missing source clip ${name}`)
  clips[name] = structuredClone(clip)
  if ('alias' in clip) include(clip.alias)
}
for (const action of ['idle', 'walk']) for (const view of ['front', 'back', 'left', 'right']) include(`${action}.${view}`)
for (const clip of Object.values(clips)) if ('frames' in clip) for (const frame of clip.frames) delete frame.mouth
for (const file of new Set(Object.values(clips).flatMap(clip => clip.frames?.map(frame => frame.file) ?? []))) {
  await mkdir(path.dirname(path.join(directory, file)), { recursive: true })
  await cp(path.join(sourceRoot, file), path.join(directory, file))
}
const sheet = path.join(root, 'art/farm/originals/work-sheet.png'), meta = await sharp(sheet).metadata()
const scale = .735, rowFeet = [398, 833, 1271], registration = []
for (const [row, action] of ['plant', 'water', 'harvest'].entries()) {
  const frames = []
  for (let col = 0; col < 4; col++) {
    const left = Math.floor(col * meta.width / 4), right = Math.floor((col + 1) * meta.width / 4)
    const top = Math.floor(row * meta.height / 3), bottom = Math.floor((row + 1) * meta.height / 3)
    const width = Math.round((right - left) * scale), height = Math.round((bottom - top) * scale)
    // Reviewed shoe-only region excludes seed particles and the watering stream.
    const supportRegion = { left: left + 40, top: rowFeet[row] - 28, width: 180, height: 32 }
    const shoes = await sharp(sheet).extract(supportRegion).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let footLeft = shoes.info.width, footRight = -1, footBottom = -1
    for (let sy = 0; sy < shoes.info.height; sy++) for (let sx = 0; sx < shoes.info.width; sx++) if (shoes.data[(sy * shoes.info.width + sx) * 4 + 3] >= 128) {
      footLeft = Math.min(footLeft, sx); footRight = Math.max(footRight, sx); footBottom = Math.max(footBottom, sy)
    }
    if (footRight < footLeft) throw new Error(`Missing planted feet: ${action}-${col + 1}`)
    const sourceFeet = { x: supportRegion.left + (footLeft + footRight + 1) / 2, y: supportRegion.top + footBottom + 1 }
    const resized = await sharp(sheet).extract({ left, top, width: right - left, height: bottom - top }).resize(width, height).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let minX = width, minY = height, maxX = -1, maxY = -1
    for (let sy = 0; sy < height; sy++) for (let sx = 0; sx < width; sx++) if (resized.data[(sy * width + sx) * 4 + 3] > 8) {
      minX = Math.min(minX, sx); minY = Math.min(minY, sy); maxX = Math.max(maxX, sx); maxY = Math.max(maxY, sy)
    }
    minX = Math.max(0, minX - 2); minY = Math.max(0, minY - 2)
    maxX = Math.min(width - 1, maxX + 2); maxY = Math.min(height - 1, maxY + 2)
    const crop = { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
    const x = Math.round(128 - (sourceFeet.x - left) * width / (right - left)) + crop.left,
      y = Math.round(344 - (sourceFeet.y - top) * height / (bottom - top)) + crop.top
    if (x < 1 || y < 1 || x + crop.width >= 256 || y + crop.height >= 384) throw new Error(`Registered farm frame overflows: ${action}-${col + 1}`)
    const image = await sharp(resized.data, { raw: resized.info }).extract(crop).png().toBuffer()
    const file = `farm/${action}/${String(col + 1).padStart(3, '0')}.png`
    await mkdir(path.dirname(path.join(directory, file)), { recursive: true })
    await sharp({ create: { width: 256, height: 384, channels: 4, background: '#00000000' } }).composite([{ input: image, left: x, top: y }]).png().toFile(path.join(directory, file))
    frames.push({ file, durationMs: 450 })
    registration.push({ file, source: { left, top, width: right - left, height: bottom - top }, scale, supportRegion, sourceFeet, crop, translate: { x, y }, foot: { x: 128, y: 344 } })
  }
  clips[`farm.${action}`] = { frames, loop: false }
}
const source = { schemaVersion: 1, id: 'farm-gardener', label: '农场园丁', profile: 'farm', canvas: original.canvas,
  pivot: original.pivot, referenceHeight: original.referenceHeight, displayHeight: 112, portrait: 'idle.front', clips }
await writeFile(path.join(directory, 'character.json'), JSON.stringify(source, null, 2) + '\n')
await cp(directory, outputDirectory, { recursive: true })
await writeFile(path.join(root, 'art/farm/registration.json'), JSON.stringify({ schemaVersion: 2, canvas: source.canvas, pivot: source.pivot,
  note: 'Whole-body frames; one common scale; each pose registered by its planted shoe contact, not by its sheet cell or head; no body-part assembly.', frames: registration }, null, 2) + '\n')
await rm(directory, { recursive: true })
console.log('Registered independent farm character frames')
