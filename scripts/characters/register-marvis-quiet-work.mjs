import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { rejectLegacyPublication } from './legacy-authoring.mjs'

if (process.argv.includes('--publish')) rejectLegacyPublication()
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { CharacterSourceSchema } from '../../src/scene/characters/packSchema.ts'
import { measureFrame, validateCharacterStandard } from './standard.mjs'
import { buildCharacter } from './build.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const art = path.join(root, 'art/characters/marvis-quiet-work-v1')
const directory = path.join(root, 'art/characters/packs/marvis')
const stage = path.join(root, '.character-staging/marvis-quiet-work-v1')
const recipe = JSON.parse(await readFile(path.join(art, 'registration.json'), 'utf8'))
const source = JSON.parse(await readFile(path.join(directory, 'character.json'), 'utf8'))
const standard = JSON.parse(await readFile(path.join(directory, 'standard.json'), 'utf8'))
const master = await readFile(path.join(directory, recipe.master))
const original = await sharp(master).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const buffers = [master], records = []

for (const { crop, patch } of recipe.candidates) {
  const input = await sharp(path.join(art, recipe.source)).extract(crop).png().toBuffer()
  const raw = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const measured = measureFrame(raw.data, raw.info.width, raw.info.height, { headTop: 0, headBottom: recipe.headBottom - crop.top })
  const scale = Math.sqrt(standard.views.back.headArea / measured.headArea)
  const width = Math.round(crop.width * scale), height = Math.round(crop.height * scale)
  const left = Math.round(source.pivot.x - (measured.headCenter + .5) * width / crop.width + .5)
  const top = Math.round(377 - measured.footY * height / crop.height)
  const resized = await sharp(input).resize(width, height).png().toBuffer()
  const registered = await sharp({ create: { ...source.canvas, channels: 4, background: '#00000000' } })
    .composite([{ input: resized, left, top }]).ensureAlpha().raw().toBuffer()
  const output = Buffer.from(original.data)
  // Import the generated local edit only; the entire head, torso center and feet
  // remain the accepted master. This produces a complete frame, not runtime parts.
  for (let y = patch.top; y < patch.top + patch.height; y++) for (let x = patch.left; x < patch.left + patch.width; x++) {
    const i = (y * source.canvas.width + x) * 4
    const edge = Math.min(x - patch.left, y - patch.top, patch.left + patch.width - 1 - x, patch.top + patch.height - 1 - y)
    const blend = Math.min(1, edge / 3)
    if (!blend) continue
    const oldAlpha = original.data[i + 3] * (1 - blend), newAlpha = registered[i + 3] * blend, alpha = oldAlpha + newAlpha
    for (let c = 0; c < 3; c++) output[i + c] = alpha ? Math.round((original.data[i + c] * oldAlpha + registered[i + c] * newAlpha) / alpha) : original.data[i + c]
    output[i + 3] = Math.round(alpha)
  }
  buffers.push(await sharp(output, { raw: original.info }).png().toBuffer())
  records.push({ crop, patch, scale, left, top, width, height })
}
const frames = [buffers[0], buffers[1], buffers[0], buffers[2]]
const files = frames.map((_, i) => `work/quiet-back-v1/${String(i + 1).padStart(3, '0')}.png`)
const sequence = Array.from({ length: recipe.cyclesBeforePause }, () => files.map(file => ({ file, durationMs: recipe.cycleFrameMs }))).flat()
sequence.push({ file: files[0], durationMs: recipe.pauseMs })
source.clips['work.quiet-back'] = { loop: true, frames: sequence }
for (const file of files) standard.frames[file] = { ...standard.frames[recipe.master] }
if (!standard.requiredClips.includes('work.quiet-back')) standard.requiredClips.push('work.quiet-back')
CharacterSourceSchema.parse(source)
const allBuffers = new Map(files.map((file, i) => [file, frames[i]]))
for (const file of Object.keys(standard.frames)) if (!allBuffers.has(file)) allBuffers.set(file, await readFile(path.join(directory, file)))
await validateCharacterStandard(directory, source, allBuffers, standard)
await mkdir(stage, { recursive: true }); await cp(directory, stage, { recursive: true })
const json = value => JSON.stringify(value, null, 2) + '\n'
async function publish(target) {
  for (const [i, file] of files.entries()) { await mkdir(path.dirname(path.join(target, file)), { recursive: true }); await writeFile(path.join(target, file), frames[i]) }
  await writeFile(path.join(target, 'character.json'), json(source))
  await writeFile(path.join(target, 'standard.json'), json(standard))
}
await publish(stage)
await buildCharacter(stage)
await writeFile(path.join(art, 'registered-frames.json'), json(records))
await sharp({ create: { width: 256 * 5, height: 384, channels: 4, background: '#ffffff' } })
  .composite([master, ...frames].map((input, i) => ({ input, left: i * 256, top: 0 }))).png().toFile(path.join(art, 'comparison.png'))
const previews = []
for (const frame of sequence) {
  previews.push(await sharp({ create: { width: 512, height: 384, channels: 4, background: '#ffffff' } })
    .composite([{ input: master, left: 0, top: 0 }, { input: allBuffers.get(frame.file), left: 256, top: 0 }])
    .png().toBuffer())
}
await sharp(previews, { join: { animated: true } }).gif({ loop: 0, delay: sequence.map(frame => frame.durationMs), dither: 0 }).toFile(path.join(art, 'comparison.gif'))
if (process.argv.includes('--publish')) await publish(directory)
console.log(`Marvis quiet work ${process.argv.includes('--publish') ? 'published' : 'staged'}; only two local sleeve regions changed`)
