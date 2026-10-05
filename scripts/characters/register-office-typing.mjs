import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { rejectLegacyPublication } from './legacy-authoring.mjs'

if (process.argv.includes('--publish')) rejectLegacyPublication()
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { createServer } from 'vite'
import { measureFrame, validateCharacterStandard } from './standard.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const artName = process.argv.find(argument => argument.startsWith('--art='))?.slice(6) ?? 'office-typing-v1'
if (!/^office-typing-v\d+$/.test(artName)) throw new Error('Invalid typing art version')
const art = path.join(root, 'art/characters', artName)
const staging = path.join(root, '.character-staging', artName.replace('office-', ''))
const json = value => JSON.stringify(value, null, 2) + '\n'
const recipe = JSON.parse(await readFile(path.join(art, 'registration.json'), 'utf8'))
const outputDirectory = recipe.outputDirectory ?? 'work/typing-back'
const durations = recipe.frameDurationsMs ?? [160, 160, 160, 160]
if (!/^work\/typing-back(?:-v\d+)?$/.test(outputDirectory) || durations.length !== 4 || durations.some(duration => !Number.isInteger(duration) || duration <= 0)) throw new Error('Invalid typing output or timing')
const file = path.join(art, recipe.source)
const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const server = await createServer({ root, configFile: false, server: { middlewareMode: true } })
let crops
try {
  const { detectApartmentFrames } = await server.ssrLoadModule('/example/office-web/src/scene/characters/apartmentFrames.ts')
  crops = detectApartmentFrames(data, info.width, info.height, 6, 4)
} finally { await server.close() }

const prepared = []
for (const [row, entry] of recipe.rows.entries()) {
  const directory = path.join(root, 'art/characters/packs', entry.id)
  const source = JSON.parse(await readFile(path.join(directory, 'character.json'), 'utf8'))
  const standard = JSON.parse(await readFile(path.join(directory, 'standard.json'), 'utf8'))
  const outputs = new Map(), frames = [], records = []
  const inputs = []
  for (let index = 0; index < 4; index++) {
    const crop = crops[row * 4 + index]
    const input = await sharp(file).extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height }).png().toBuffer()
    const raw = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const headBottom = entry.headBottom - crop.y
    const measured = measureFrame(raw.data, raw.info.width, raw.info.height, { headTop: 0, headBottom })
    inputs.push({ crop, input, headBottom, measured })
  }
  // One scale per loop prevents a lifted hand in the head band from causing zoom.
  const sharedScale = Math.sqrt(standard.views.back.headArea / (inputs.reduce((sum, input) => sum + input.measured.headArea, 0) / inputs.length))
  for (const [index, { crop, input, headBottom, measured }] of inputs.entries()) {
    const scale = recipe.sharedScale ? sharedScale : Math.sqrt(standard.views.back.headArea / measured.headArea)
    const width = Math.round(crop.width * scale), height = Math.round(crop.height * scale)
    const sx = width / crop.width, sy = height / crop.height
    const left = Math.round(source.pivot.x - (measured.headCenter + .5) * sx + .5)
    const top = Math.round(377 - measured.footY * sy)
    if (left <= 0 || top <= 0 || left + width >= source.canvas.width || top + height >= source.canvas.height) throw new Error(`${entry.id}: typing frame exceeds canvas`)
    const image = await sharp(input).resize(width, height).png().toBuffer()
    const buffer = await sharp({ create: { ...source.canvas, channels: 4, background: '#00000000' } })
      .composite([{ input: image, left, top }]).png().toBuffer()
    const output = `${outputDirectory}/${String(index + 1).padStart(3, '0')}.png`
    outputs.set(output, buffer)
    frames.push({ file: output, durationMs: durations[index] })
    standard.frames[output] = { view: 'back', headTop: top, headBottom: Math.round(top + headBottom * sy), footY: 377 }
    records.push({ crop, headBottom: entry.headBottom, file: output, scale, left, top })
  }
  source.clips['work.typing-back'] = { frames, loop: true }
  if (!standard.requiredClips.includes('work.typing-back')) standard.requiredClips.push('work.typing-back')
  const buffers = new Map(outputs)
  for (const name of Object.keys(standard.frames)) if (!buffers.has(name)) buffers.set(name, await readFile(path.join(directory, name)))
  await validateCharacterStandard(directory, source, buffers, standard)
  prepared.push({ id: entry.id, directory, source, standard, outputs, records })
}

for (const item of prepared) {
  const stage = path.join(staging, item.id)
  await mkdir(stage, { recursive: true })
  await cp(item.directory, stage, { recursive: true })
  for (const [name, buffer] of item.outputs) {
    await mkdir(path.dirname(path.join(stage, name)), { recursive: true })
    await writeFile(path.join(stage, name), buffer)
  }
  await writeFile(path.join(stage, 'character.json'), json(item.source))
  await writeFile(path.join(stage, 'standard.json'), json(item.standard))
}
await writeFile(path.join(art, 'registered-frames.json'), json(prepared.map(({ id, records }) => ({ id, frames: records }))))
await sharp({ create: { width: 1280, height: 2304, channels: 4, background: '#00000000' } })
  .composite(prepared.flatMap((item, row) => [
    { input: path.join(item.directory, 'standard-v2/sit/back/001.png'), left: 0, top: row * 384 },
    ...[...item.outputs.values()].map((input, index) => ({ input, left: (index + 1) * 256, top: row * 384 })),
  ])).png().toFile(path.join(art, 'comparison.png'))

if (process.argv.includes('--publish')) {
  for (const item of prepared) {
    for (const [name, buffer] of item.outputs) {
      await mkdir(path.dirname(path.join(item.directory, name)), { recursive: true })
      await writeFile(path.join(item.directory, name), buffer)
    }
    await writeFile(path.join(item.directory, 'character.json'), json(item.source))
    await writeFile(path.join(item.directory, 'standard.json'), json(item.standard))
  }
}
console.log(`${prepared.length} typing loops ${process.argv.includes('--publish') ? 'published' : `staged at ${staging}`}`)
