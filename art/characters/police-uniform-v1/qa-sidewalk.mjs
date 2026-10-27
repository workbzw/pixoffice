import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '../../..')
const staging = path.resolve(root, process.env.POLICE_STAGING_ROOT ?? '.character-staging/civic-sidewalk-v13')
const output = path.join(import.meta.dirname, 'qa')
const ids = ['office-lead', 'code-agent', 'file-agent', 'app-agent', 'review-agent', 'data-agent']
const rows = []
await mkdir(output, { recursive: true })
for (const id of ids) {
  const directory = path.join(staging, id)
  const character = JSON.parse(await readFile(path.join(directory, 'character.json'), 'utf8'))
  rows.push([character.clips['idle.right'].frames[0], ...character.clips['walk.right'].frames]
    .map(frame => path.join(directory, frame.file)))
}

const contact = []
for (const [row, files] of rows.entries()) for (const [column, file] of files.entries()) {
  contact.push({ input: file, left: column * 256, top: row * 384 })
}
await sharp({ create: { width: 1280, height: 2304, channels: 4, background: '#edf1ef' } })
  .composite(contact).png().toFile(path.join(output, 'walking-contact.png'))

const phases = [0, 1, 2, 3, 4, 1, 2, 3, 4, 0]

const comparisons = []
for (const phase of phases) {
  const layers = []
  for (const [index, actor] of [0, 2, 4, 1, 3, 5].entries()) {
    layers.push({ input: rows[actor][phase], left: index % 3 * 256, top: Math.floor(index / 3) * 384 })
  }
  comparisons.push(await sharp({ create: { width: 768, height: 768, channels: 4, background: '#edf1ef' } })
    .composite(layers).raw().toBuffer())
}
await sharp(Buffer.concat(comparisons), { raw: { width: 768, height: 768 * phases.length, pageHeight: 768, channels: 4 } })
  .webp({ quality: 90, loop: 0, delay: phases.map((_, index) => index === 0 || index === phases.length - 1 ? 600 : 200) })
  .toFile(path.join(output, 'walking-template-comparison.webp'))

const directions = ['front', 'right', 'back', 'left']
const walking = []
for (const id of ids) {
  const directory = path.join(staging, id)
  const character = JSON.parse(await readFile(path.join(directory, 'character.json'), 'utf8'))
  walking.push(directions.map(view => {
    const sourceView = view === 'left' ? 'right' : view
    return [character.clips[`idle.${sourceView}`].frames[0], ...character.clips[`walk.${sourceView}`].frames]
      .map(frame => ({ file: path.join(directory, frame.file), mirror: view === 'left' }))
  }))
}
const allFrames = []
for (const phase of phases) {
  const layers = []
  for (const [column, views] of walking.entries()) for (const [row, files] of views.entries()) {
    const frame = files[phase]
    let sprite = sharp(frame.file)
    if (frame.mirror) sprite = sprite.flop()
    layers.push({ input: await sprite.resize(128, 192).png().toBuffer(), left: column * 128, top: row * 192 })
  }
  allFrames.push(await sharp({ create: { width: 768, height: 768, channels: 4, background: '#edf1ef' } })
    .composite(layers).raw().toBuffer())
}
await sharp(Buffer.concat(allFrames), { raw: { width: 768, height: 768 * allFrames.length, pageHeight: 768, channels: 4 } })
  .webp({ quality: 90, loop: 0, delay: phases.map((_, index) => index === 0 || index === phases.length - 1 ? 600 : 180) })
  .toFile(path.join(output, 'walking-directions.webp'))
console.log(output)
