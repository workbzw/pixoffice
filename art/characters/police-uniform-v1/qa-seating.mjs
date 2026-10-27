import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { buildCharacter } from '../../../scripts/characters/build.mjs'
import { inspectCharacterQuality } from '../../../scripts/characters/quality.mjs'
import { measureFrame } from '../../../scripts/characters/standard.mjs'

const root = path.resolve(import.meta.dirname, '../../..')
const staging = path.resolve(root, process.env.POLICE_STAGING_ROOT ?? '.character-staging/civic-sidewalk-v13')
const output = path.join(import.meta.dirname, 'qa')
const ids = ['office-lead', 'code-agent', 'file-agent', 'app-agent', 'review-agent', 'data-agent']
const poses = ['idle.front', 'idle.back', 'sit.back', 'pose.rise-1', 'pose.rise-3', 'talk.seated-right']
const packs = [], reports = [], layers = []
await mkdir(output, { recursive: true })
for (const [column, id] of ids.entries()) {
  const directory = path.join(staging, id)
  const character = JSON.parse(await readFile(path.join(directory, 'character.json'), 'utf8'))
  const standard = JSON.parse(await readFile(path.join(directory, 'standard.json'), 'utf8'))
  await buildCharacter(directory)
  const measurements = {}
  for (const [row, name] of poses.entries()) {
    const frame = character.clips[name].frames[0], file = path.join(directory, frame.file)
    layers.push({ input: file, left: column * 256, top: row * 408 + 24 })
    const label = `<svg width="256" height="24"><text x="128" y="17" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#34433b">${id} / ${name}</text></svg>`
    layers.push({ input: Buffer.from(label), left: column * 256, top: row * 408 })
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    measurements[name] = measureFrame(data, info.width, info.height, standard.frames[frame.file])
  }
  const quality = await inspectCharacterQuality(directory)
  reports.push({ id, technical: 'passed', measurements, quality })
  packs.push({ directory, character })
}
await sharp({ create: { width: 1536, height: poses.length * 408, channels: 4, background: '#f2f5f3' } })
  .composite(layers).png().toFile(path.join(output, 'seating-v10-contact.png'))
const animation = [], delays = [], width = 1152, pageHeight = 288
for (let index = 0; index < 18; index++) {
  const overlays = []
  for (const [column, { directory, character }] of packs.entries()) {
    const rising = character.clips['stand-up.back'].frames
    const working = character.clips['work.quiet-back'].frames
    const frame = index < 4 ? working[index] : index < 10 ? rising[index - 4] : index < 12 ? rising[5] : rising[17 - index]
    overlays.push({ input: await sharp(path.join(directory, frame.file)).resize(192, 288).png().toBuffer(), left: column * 192, top: 0 })
  }
  animation.push(await sharp({ create: { width, height: pageHeight, channels: 4, background: '#f2f5f3' } }).composite(overlays).raw().toBuffer())
  delays.push(index < 4 ? 250 : index === 9 || index === 11 ? 400 : 150)
}
await sharp(Buffer.concat(animation), { raw: { width, height: pageHeight * animation.length, pageHeight, channels: 4 } })
  .webp({ quality: 90, loop: 0, delay: delays }).toFile(path.join(output, 'seating-v10.webp'))
await writeFile(path.join(output, 'seating-v10-audit.json'), JSON.stringify({ status: 'preview-only', reports }, null, 2) + '\n')
console.log(reports.map(({ id, technical, quality }) => ({ id, technical, issues: quality.issues })))
