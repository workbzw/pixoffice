import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { sampleQuietWork } from '@pixoffice/assets-office/frame/workAnimation'
import { buildCharacter } from './build.mjs'

if (process.argv.includes('--publish')) {
  throw new Error('Composite work v3 is retired. Use the staged admission workflow in docs/character-admission.md.')
}

const root = path.resolve(import.meta.dirname, '../..')
const art = path.join(root, 'art/characters/office-quiet-work-v3')
const recipe = JSON.parse(await readFile(path.join(art, 'pose.json'), 'utf8'))
const actors = Object.keys(recipe.characters)
const stageRoot = path.join(root, '.character-staging/quiet-work-v3')
const referenceDirectory = path.join(root, 'art/characters/packs', recipe.reference)
const reference = JSON.parse(await readFile(path.join(referenceDirectory, 'character.json'), 'utf8'))
const referenceClip = reference.clips[recipe.clip]
const referenceFiles = [...new Set(referenceClip.frames.map(frame => frame.file))]
if (referenceFiles.length !== 4) throw new Error('The reference work clip must contain four poses')

async function extractHand(file, side) {
  const { crop } = recipe.hands[side]
  const { data, info } = await sharp(path.join(referenceDirectory, file)).extract(crop).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const skin = new Uint8Array(info.width * info.height)
  for (let i = 0; i < skin.length; i++) {
    const p = i * 4
    skin[i] = Number(data[p + 3] > 0 && data[p] > 210 && data[p + 1] > 150 && data[p + 2] > 110 && data[p] - data[p + 1] > 18)
  }
  // Retain one pixel of the existing linework around the annotated skin region.
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    let keep = false
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const px = x + dx, py = y + dy
      if (px >= 0 && px < info.width && py >= 0 && py < info.height && skin[py * info.width + px]) keep = true
    }
    if (!keep) data[(y * info.width + x) * 4 + 3] = 0
  }
  return sharp(data, { raw: info }).png().toBuffer()
}
const handFrames = await Promise.all(referenceFiles.map(async file => ({ left: await extractHand(file, 'left'), right: await extractHand(file, 'right') })))

async function bakeFrame(directory, source, phase) {
  const rig = { ...source.work, hand: { ...source.work.hand, tip: { x: source.work.hand.root.x, y: source.work.hand.root.y + 14 } } }
  const profile = recipe.characters[source.id]
  const surface = {
    keyboardLeft: { x: profile.left, y: recipe.contactY },
    keyboardRight: { x: profile.right, y: recipe.contactY },
    mouse: { x: profile.right, y: recipe.contactY },
    bounds: { left: 16, right: 240, back: 220, front: 254 },
  }
  const sample = sampleQuietWork(rig, surface, 0)
  if (!sample) throw new Error(`${source.id}: work surface is unreachable`)
  const clips = source.clips
  const image = async clip => {
    const file = clips[clip]?.frames?.[0]?.file
    if (!file) throw new Error(`${source.id}: missing ${clip}`)
    return readFile(path.join(directory, file))
  }
  const layers = await Promise.all(sample.parts.filter((_, index) => index !== 2 && index !== 5).map(async part => {
    const png = await image(part.clip)
    const degrees = part.rotation * 180 / Math.PI
    return `<image href="data:image/png;base64,${png.toString('base64')}" width="256" height="384" transform="translate(${part.position.x} ${part.position.y}) rotate(${degrees}) scale(${part.mirror} 1) translate(${-part.root.x} ${-part.root.y})"/>`
  }))
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="256" height="384" viewBox="0 0 256 384">${layers.join('')}</svg>`)
  const arms = await sharp(svg).png().toBuffer()
  const body = await image('work.computer-back')
  const hands = ['left', 'right'].map(side => ({ input: handFrames[phase][side],
    left: recipe.hands[side].crop.left + profile[side] - recipe.hands[side].wrist.x,
    top: recipe.hands[side].crop.top }))
  return sharp(arms).composite([...hands, { input: body, left: 0, top: 0 }]).png().toBuffer()
}

async function prepare(id) {
  const original = path.join(root, 'art/characters/packs', id)
  const staged = path.join(stageRoot, id)
  const source = JSON.parse(await readFile(path.join(original, 'character.json'), 'utf8'))
  const standard = JSON.parse(await readFile(path.join(original, 'standard.json'), 'utf8'))
  if (!source.work || !source.clips['work.computer-back']) throw new Error(`${id}: missing work source`)
  const frames = await Promise.all([0, 1, 2, 3].map(phase => bakeFrame(original, source, phase)))
  const files = frames.map((_, index) => `work/quiet-back-v3/00${index + 1}.png`)
  const sequence = referenceClip.frames.map(frame => ({ file: files[referenceFiles.indexOf(frame.file)], durationMs: frame.durationMs }))
  source.clips[recipe.clip] = { loop: referenceClip.loop, frames: sequence }
  const headRule = standard.frames[source.clips['work.computer-back'].frames[0].file]
  for (const file of files) standard.frames[file] = { ...headRule }

  await cp(original, staged, { recursive: true })
  for (const [index, file] of files.entries()) {
    const target = path.join(staged, file)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, frames[index])
  }
  await writeFile(path.join(staged, 'character.json'), JSON.stringify(source, null, 2) + '\n')
  await writeFile(path.join(staged, 'standard.json'), JSON.stringify(standard, null, 2) + '\n')
  await buildCharacter(staged)
  return { original, staged, files, frames }
}

const prepared = []
for (const id of actors) prepared.push(await prepare(id))
const previews = []
for (let phase = 0; phase < 4; phase++) {
  const leader = await readFile(path.join(referenceDirectory, referenceFiles[phase]))
  previews.push(await sharp({ create: { width: 256 * 6, height: 384, channels: 4, background: '#ffffff' } })
    .composite([leader, ...prepared.map(item => item.frames[phase])].map((input, index) => ({ input, left: index * 256, top: 0 })))
    .png().toBuffer())
}
await writeFile(path.join(art, 'pose-comparison.png'), previews[0])
await sharp(referenceClip.frames.map(frame => previews[referenceFiles.indexOf(frame.file)]), { join: { animated: true } })
  .gif({ loop: 0, delay: referenceClip.frames.map(frame => frame.durationMs), dither: 0 })
  .toFile(path.join(art, 'work-preview.gif'))
if (process.argv.includes('--publish')) {
  for (const { original, staged, files } of prepared) {
    for (const file of files) {
      const target = path.join(original, file)
      await mkdir(path.dirname(target), { recursive: true })
      await cp(path.join(staged, file), target)
    }
    for (const file of ['character.json', 'standard.json']) await cp(path.join(staged, file), path.join(original, file))
  }
}
console.log(`Quiet work: ${prepared.length} packs ${process.argv.includes('--publish') ? 'published' : 'staged'} and validated`)
