import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { rejectLegacyPublication } from './legacy-authoring.mjs'

if (process.argv.includes('--publish')) rejectLegacyPublication()
import path from 'node:path'
import sharp from 'sharp'
import { measureFrame, validateCharacterStandard } from './standard.mjs'
import { buildCharacter } from './build.mjs'

const art = 'art/characters/marvis-quiet-work-v2'
const pack = 'art/characters/packs/marvis'
const stage = '.character-staging/marvis-quiet-work-v2'
const recipe = JSON.parse(await readFile(`${art}/registration.json`, 'utf8'))
const source = JSON.parse(await readFile(`${pack}/character.json`, 'utf8'))
const standard = JSON.parse(await readFile(`${pack}/standard.json`, 'utf8'))
const master = await readFile(`${pack}/standard-v2/sit/back/001.png`)
const input = await sharp(`${art}/${recipe.pose.source}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const measured = measureFrame(input.data, input.info.width, input.info.height, recipe.pose)
const scale = Math.sqrt(standard.views.back.headArea / measured.headArea)
const width = Math.round(input.info.width * scale), height = Math.round(input.info.height * scale)
const left = Math.round(128 - measured.headCenter * scale)
const top = Math.round(377 - measured.footY * scale)
const resized = await sharp(`${art}/${recipe.pose.source}`).resize(width, height).png().toBuffer()
const registered = await sharp({ create: { width: 256, height: 384, channels: 4, background: '#00000000' } })
  .composite([{ input: resized, left, top }]).png().toBuffer()
await writeFile(`${art}/registered-candidate.png`, registered)
const neutral = await sharp(registered).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const headRule = { view: 'back', headTop: 124, headBottom: 253, footY: 377 }
const neutralHead = measureFrame(neutral.data, 256, 384, headRule)
const changed = [], records = []
for (const { crop, patch } of recipe.motion.candidates) {
  const candidate = await sharp(`${art}/${recipe.motion.source}`).extract(crop).png().toBuffer()
  const raw = await sharp(candidate).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const head = measureFrame(raw.data, crop.width, crop.height, recipe.motion)
  const ratio = Math.sqrt(neutralHead.headArea / head.headArea)
  const w = Math.round(crop.width * ratio), h = Math.round(crop.height * ratio)
  const x = Math.round(neutralHead.headCenter - head.headCenter * ratio)
  const y = Math.round(377 - head.footY * ratio)
  const aligned = await sharp({ create: { width: 256, height: 384, channels: 4, background: '#00000000' } })
    .composite([{ input: await sharp(candidate).resize(w, h).png().toBuffer(), left: x, top: y }]).raw().toBuffer()
  const frame = Buffer.from(neutral.data)
  // Import generated finger edits only. The rest of each complete frame is
  // byte-identical to the accepted working pose, not the old resting pose.
  for (let py = patch.top; py < patch.top + patch.height; py++) for (let px = patch.left; px < patch.left + patch.width; px++) {
    const i = (py * 256 + px) * 4
    const edge = Math.min(px - patch.left, py - patch.top, patch.left + patch.width - 1 - px, patch.top + patch.height - 1 - py)
    const blend = Math.min(1, edge / 3)
    if (!blend) continue
    const a = neutral.data[i + 3] * (1 - blend), b = aligned[i + 3] * blend
    for (let c = 0; c < 3; c++) frame[i + c] = a + b ? Math.round((neutral.data[i + c] * a + aligned[i + c] * b) / (a + b)) : neutral.data[i + c]
    frame[i + 3] = Math.round(a + b)
  }
  changed.push(await sharp(frame, { raw: neutral.info }).png().toBuffer())
  records.push({ crop, patch, scale: ratio, left: x, top: y, width: w, height: h })
}
const frames = [registered, changed[0], registered, changed[1]]
const files = frames.map((_, i) => `work/quiet-back-v2/00${i + 1}.png`)
const sequence = Array.from({ length: recipe.cyclesBeforePause }, () => files.map(file => ({ file, durationMs: recipe.cycleFrameMs }))).flat()
sequence.push({ file: files[0], durationMs: recipe.pauseMs })
source.clips['work.quiet-back'] = { loop: true, frames: sequence }
for (const file of files) standard.frames[file] = headRule
const buffers = new Map(files.map((file, i) => [file, frames[i]]))
for (const file of Object.keys(standard.frames)) if (!buffers.has(file)) buffers.set(file, await readFile(`${pack}/${file}`))
await validateCharacterStandard(pack, source, buffers, standard)
await mkdir(stage, { recursive: true }); await cp(pack, stage, { recursive: true })
async function publish(target) {
  for (const [i, file] of files.entries()) {
    await mkdir(path.dirname(`${target}/${file}`), { recursive: true })
    await writeFile(`${target}/${file}`, frames[i])
  }
  for (const [name, value] of [['character', source], ['standard', standard]]) await writeFile(`${target}/${name}.json`, JSON.stringify(value, null, 2) + '\n')
}
await publish(stage)
await buildCharacter(stage)
await writeFile(`${art}/registered-frames.json`, JSON.stringify({ pose: { scale, left, top, width, height, measured }, motion: records }, null, 2) + '\n')

// Offline visual fixture using the same source crops and dimensions as DeskEntity.
// All artwork is scaled uniformly; no anatomy or furniture is drawn here.
const factor = 4, origin = { x: 250, y: 200 }
const desk = 'public/assets/office/workstation-trial-v1'
const layers = []
async function part(file, crop, displayWidth, x, y) {
  const size = Math.round(displayWidth * factor)
  layers.push({ input: await sharp(`${desk}/${file}.png`).extract(crop).resize({ width: size }).png().toBuffer(),
    left: Math.round(origin.x + x * factor - size / 2), top: Math.round(origin.y + y * factor) })
}
await part('desk', { left: 92, top: 138, width: 1352, height: 756 }, 100, 0, -8 + 26 - 240 * 100 / 1352)
await part('computer', { left: 298, top: 112, width: 1004, height: 818 }, 52, 0, -8 + 21 - 818 * 52 / 1004)
const chair = await sharp(`${desk}/chair.png`).extract({ left: 208, top: 323, width: 800, height: 894 }).resize({ width: 44 * factor }).png().toBuffer()
async function panel(body) {
  return sharp({ create: { width: 500, height: 530, channels: 4, background: '#eeefed' } })
    .composite([...layers,
      { input: await sharp(body).resize({ width: Math.round(256 * .3 * factor) }).png().toBuffer(), left: Math.round(origin.x - 128 * .3 * factor), top: Math.round(origin.y + (45 - 344 * .3) * factor) },
      { input: chair, left: origin.x - 88, top: origin.y + 31 * factor },
    ]).png().toBuffer()
}
const panels = await Promise.all([master, registered].map(panel))
await sharp({ create: { width: 1000, height: 530, channels: 4, background: '#eeefed' } })
  .composite(panels.map((input, i) => ({ input, left: i * 500, top: 0 }))).png().toFile(`${art}/desk-candidate.png`)
await sharp({ create: { width: 1280, height: 384, channels: 4, background: '#ffffff' } })
  .composite([master, ...frames].map((input, i) => ({ input, left: i * 256, top: 0 }))).png().toFile(`${art}/comparison.png`)
const animated = []
for (const frame of sequence) animated.push(await panel(buffers.get(frame.file)))
await sharp(animated, { join: { animated: true } }).gif({ loop: 0, delay: sequence.map(frame => frame.durationMs), dither: 0 }).toFile(`${art}/desk-preview.gif`)
if (process.argv.includes('--publish')) await publish(pack)
console.log(`Marvis seated work v2 ${process.argv.includes('--publish') ? 'published' : 'staged'}; complete frames, fixed body, generated finger edits`)
