import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { rejectLegacyPublication } from './legacy-authoring.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { CharacterSourceSchema } from '../../src/scene/characters/packSchema.ts'

const root = fileURLToPath(new URL('../../', import.meta.url))
const canvas = { width: 256, height: 384 }, pivot = { x: 128, y: 192 }

async function save(file, buffer) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, buffer)
}

async function centeredMouth(directory, buffer, file) {
  const image = await sharp(buffer).ensureAlpha().png().toBuffer({ resolveWithObject: true })
  const output = await sharp({ create: { ...canvas, channels: 4, background: '#00000000' } }).composite([{
    input: image.data, left: pivot.x - Math.floor(image.info.width / 2), top: pivot.y - Math.floor(image.info.height / 2),
  }]).png().toBuffer()
  await save(path.join(directory, file), output)
  return file
}

async function closedMouth(directory, file, patch, view) {
  const [left, top, width, height] = patch
  const { data, info } = await sharp(path.join(directory, file)).extract({ left, top, width, height }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  // Matte the existing red lip line, removing the surrounding opaque skin.
  for (let i = 0; i < data.length; i += 4) {
    const alpha = Math.max(0, Math.min(1, (185 - data[i + 1]) / 55))
    data[i + 3] = data[i] - data[i + 1] > 45 && data[i] > 100 ? Math.round(alpha * 255) : 0
  }
  return centeredMouth(directory, await sharp(data, { raw: info }).png().toBuffer(), `mouth/${view}/closed.png`)
}

export async function createCharacterMouthLayer({ id, art, mouthRegistration, reuse = {} }) {
  rejectLegacyPublication()
  const directory = path.join(root, 'art/characters/packs', id)
  const sheetHeight = Math.ceil(mouthRegistration.length / 4) * 260
  const source = CharacterSourceSchema.parse(JSON.parse(await readFile(path.join(directory, 'character.json'), 'utf8')))
  const edited = await sharp(path.join(art, 'mouthless-faces.png')).resize(1280, sheetHeight, { fit: 'fill' }).raw().ensureAlpha().toBuffer()
  const registrations = new Map()
  for (const [index, registration] of mouthRegistration.entries()) {
    const { file, crop, patch, mouth } = registration
    const [x, y, width, height] = patch
    const { data, info } = await sharp(path.join(directory, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    // Import only the small mouth patch. Every other source pixel, including alpha, remains exact.
    const editedPatch = await sharp(edited, { raw: { width: 1280, height: sheetHeight, channels: 4 } }).extract({
      left: index % 4 * 320 + (x - crop[0]) * 4, top: Math.floor(index / 4) * 260 + (y - crop[1]) * 4,
      width: width * 4, height: height * 4,
    }).resize(width, height).raw().toBuffer()
    for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
      const target = ((y + row) * info.width + x + col) * 4, from = (row * width + col) * 4
      const edge = Math.min(row, col, height - 1 - row, width - 1 - col)
      const blend = Math.min(1, edge / 2)
      for (let channel = 0; channel < 3; channel++) data[target + channel] = Math.round(data[target + channel] * (1 - blend) + editedPatch[from + channel] * blend)
    }
    const body = `body/${file}`
    await save(path.join(directory, body), await sharp(data, { raw: info }).png().toBuffer())
    registrations.set(file, { file: body, mouth })
  }
  for (const [file, target] of Object.entries(reuse)) {
    const original = await sharp(path.join(directory, file)).ensureAlpha().raw().toBuffer()
    const shared = await sharp(path.join(directory, target)).ensureAlpha().raw().toBuffer()
    if (!original.equals(shared)) throw new Error(`${id}/${file}: cannot reuse a different body pose`)
    if (!registrations.has(target)) throw new Error(`${id}/${target}: missing mouth registration`)
    registrations.set(file, registrations.get(target))
  }
  for (const [name, clip] of Object.entries(source.clips)) {
    if (!/^(idle|walk|talk)\./.test(name) || !('frames' in clip)) continue
    clip.frames = clip.frames.map(frame => ({ ...frame, ...registrations.get(frame.file.replace(/^body\//, '')) }))
  }
  const crops = [
    [{ left: 259, top: 321, width: 88, height: 39 }, { left: 713, top: 308, width: 109, height: 66 }, { left: 1174, top: 298, width: 140, height: 77 }],
    [{ left: 266, top: 760, width: 67, height: 48 }, { left: 728, top: 749, width: 88, height: 69 }, { left: 1191, top: 735, width: 111, height: 94 }],
  ]
  for (const [index, view] of ['front', 'right'].entries()) {
    const registration = mouthRegistration[index]
    const closed = await closedMouth(directory, registration.file, registration.patch, view)
    const open = []
    for (const [stage, crop] of crops[index].entries()) {
      const width = (index === 0 ? [12, 14, 16] : [5, 7, 8])[stage]
      const mouth = await sharp(path.join(root, 'art/characters/speech-mouths/mouths.png')).extract(crop).resize({ width }).png().toBuffer()
      open.push(await centeredMouth(directory, mouth, `mouth/${view}/open-${stage + 1}.png`))
    }
    source.clips[`mouth.${view}-closed`] = { frames: [{ file: closed, durationMs: 1000 }], loop: false }
    source.clips[`mouth.${view}-speaking`] = { loop: true, frames: [[open[0], 110], [open[1], 100], [closed, 100], [open[2], 120], [open[1], 90], [closed, 210]].map(([file, durationMs]) => ({ file, durationMs })) }
  }
  source.mouth = { pivot, views: Object.fromEntries(['front', 'right'].map(view => [view, { closed: `mouth.${view}-closed`, speaking: `mouth.${view}-speaking` }])) }
  for (const [name, target] of Object.entries({ front: 'idle.front', right: 'idle.right', left: 'idle.left', 'seated-right': 'talk.seated-right', 'seated-left': 'talk.seated-left' })) source.clips[`speak.${name}`] = { alias: target, mirrorX: false }
  await writeFile(path.join(directory, 'character.json'), JSON.stringify(CharacterSourceSchema.parse(source), null, 2) + '\n')
}
