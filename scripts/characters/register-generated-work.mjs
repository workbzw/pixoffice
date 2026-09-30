import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { buildCharacter } from './build.mjs'
import { measureFrame } from './standard.mjs'
import { rejectLegacyPublication } from './legacy-authoring.mjs'

if (process.argv.includes('--publish')) rejectLegacyPublication()

const root = path.resolve(import.meta.dirname, '../..')
const art = path.join(root, 'art/characters/office-quiet-work-v4')
const recipe = JSON.parse(await readFile(path.join(art, 'registration.json'), 'utf8'))
const referenceDirectory = path.join(root, 'art/characters/packs', recipe.reference)
const reference = JSON.parse(await readFile(path.join(referenceDirectory, 'character.json'), 'utf8'))
const referenceClip = reference.clips[recipe.clip]
const referenceFiles = [...new Set(referenceClip.frames.map(frame => frame.file))]
const json = value => JSON.stringify(value, null, 2) + '\n'

if (process.argv.includes('--prepare')) {
  for (const entry of recipe.characters) {
    const directory = path.join(art, entry.id)
    const neutral = await sharp(path.join(directory, 'neutral.png')).resize({ width: 768, height: 1152, fit: 'contain', background: '#00000000' }).png().toBuffer()
    await sharp({ create: { width: 1536, height: 1152, channels: 4, background: '#00000000' } })
      .composite([{ input: neutral, left: 0, top: 0 }, { input: neutral, left: 768, top: 0 }])
      .png().toFile(path.join(directory, 'motion-input.png'))
  }
  console.log('Prepared five complete-character edit sheets')
} else {
  const prepared = []
  for (const entry of recipe.characters) {
    const original = path.join(root, 'art/characters/packs', entry.id)
    const staged = path.join(root, '.character-staging/generated-work-v4', entry.id)
    const source = JSON.parse(await readFile(path.join(original, 'character.json'), 'utf8'))
    const standard = JSON.parse(await readFile(path.join(original, 'standard.json'), 'utf8'))
    const inputs = process.argv.includes('--neutral-only') ? [entry.neutral, entry.neutral, entry.neutral, entry.neutral]
      : [entry.neutral, entry.motion?.left, entry.neutral, entry.motion?.right]
    if (inputs.some(input => !input)) throw new Error(`${entry.id}: missing complete motion images`)
    const frames = [], records = []
    for (const [phase, input] of inputs.entries()) {
      const file = phase % 2 && !process.argv.includes('--neutral-only') ? 'motion.png' : 'neutral.png'
      let pipeline = sharp(path.join(art, entry.id, file))
      if (input.crop) pipeline = pipeline.extract(input.crop)
      const buffer = await pipeline.png().toBuffer()
      const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      const measured = measureFrame(data, info.width, info.height, input)
      const scale = Math.sqrt(standard.views.back.headArea / measured.headArea)
      const width = Math.round(info.width * scale), height = Math.round(info.height * scale)
      const left = Math.round(source.pivot.x - measured.headCenter * scale)
      const top = Math.round(377 - measured.footY * scale)
      // Only the complete source image is transformed; no character parts or motion patches are composed.
      const resized = await sharp(buffer).resize(width, height).png().toBuffer()
      const placed = await sharp({ create: { width: 1280, height: 1280, channels: 4, background: '#00000000' } })
        .composite([{ input: resized, left: 512 + left, top: 512 + top }])
        .png().toBuffer()
      const frame = await sharp(placed)
        .extract({ left: 513, top: 513, width: 254, height: 382 })
        .extend({ top: 1, bottom: 1, left: 1, right: 1, background: '#00000000' }).png().toBuffer()
      frames.push(frame)
      records.push({ input: file, crop: input.crop, scale, left, top, width, height, measured,
        rule: { view: 'back', headTop: Math.max(1, Math.floor(top + input.headTop * scale)), headBottom: Math.ceil(top + input.headBottom * scale), footY: 377 } })
    }
    const files = frames.map((_, index) => `work/quiet-back-v4/00${index + 1}.png`)
    source.clips[recipe.clip] = { loop: referenceClip.loop, frames: referenceClip.frames.map(frame => ({ file: files[referenceFiles.indexOf(frame.file)], durationMs: frame.durationMs })) }
    if (!standard.requiredClips.includes(recipe.clip)) standard.requiredClips.push(recipe.clip)
    for (const [index, file] of files.entries()) standard.frames[file] = records[index].rule
    await cp(original, staged, { recursive: true })
    for (const [index, file] of files.entries()) {
      const target = path.join(staged, file)
      await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, frames[index])
    }
    await writeFile(path.join(staged, 'character.json'), json(source))
    await writeFile(path.join(staged, 'standard.json'), json(standard))
    await buildCharacter(staged)
    prepared.push({ id: entry.id, original, staged, files, frames, records })
  }
  const previews = []
  for (let phase = 0; phase < 4; phase++) {
    const leader = await readFile(path.join(referenceDirectory, referenceFiles[phase]))
    previews.push(await sharp({ create: { width: 1536, height: 384, channels: 4, background: '#ffffff' } })
      .composite([leader, ...prepared.map(item => item.frames[phase])].map((input, index) => ({ input, left: index * 256, top: 0 }))).png().toBuffer())
  }
  await writeFile(path.join(art, 'pose-comparison.png'), previews[0])
  await sharp(referenceClip.frames.map(frame => previews[referenceFiles.indexOf(frame.file)]), { join: { animated: true } })
    .gif({ loop: 0, delay: referenceClip.frames.map(frame => frame.durationMs), dither: 0 }).toFile(path.join(art, 'work-preview.gif'))
  await writeFile(path.join(art, 'registered-frames.json'), json(prepared.map(({ id, records }) => ({ id, records }))))
  if (process.argv.includes('--publish')) {
    if (process.argv.includes('--neutral-only')) throw new Error('Neutral-only previews cannot be published as animation')
    for (const { original, staged, files } of prepared) {
      for (const file of [...files, 'character.json', 'standard.json']) {
        await mkdir(path.dirname(path.join(original, file)), { recursive: true })
        await cp(path.join(staged, file), path.join(original, file))
      }
    }
  }
  console.log(`${prepared.length} generated complete-character clips ${process.argv.includes('--publish') ? 'published' : 'staged'} and validated`)
}
