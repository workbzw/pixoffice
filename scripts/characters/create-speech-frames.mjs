import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { rejectLegacyPublication } from './legacy-authoring.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { CharacterSourceSchema } from '../../src/scene/characters/packSchema.ts'

const root = fileURLToPath(new URL('../../', import.meta.url))
const artwork = path.join(root, 'art/characters/speech-mouths')
const crops = [
  [{ left: 259, top: 321, width: 88, height: 39 }, { left: 713, top: 308, width: 109, height: 66 }, { left: 1174, top: 298, width: 140, height: 77 }],
  [{ left: 266, top: 760, width: 67, height: 48 }, { left: 728, top: 749, width: 88, height: 69 }, { left: 1191, top: 735, width: 111, height: 94 }],
]

export async function createSpeechFrames() {
  rejectLegacyPublication()
  const placements = JSON.parse(await readFile(path.join(artwork, 'placement.json'), 'utf8'))
  for (const [id, poses] of Object.entries(placements)) {
    const directory = path.join(root, 'art/characters/packs', id)
    const source = CharacterSourceSchema.parse(JSON.parse(await readFile(path.join(directory, 'character.json'), 'utf8')))
    if (source.mouth) continue
    for (const [pose, [x, y, width, height]] of Object.entries(poses)) {
      const base = pose === 'seated-right' ? 'talk/seated-right/001.png' : `idle/${pose}/001.png`
      const { data, info } = await sharp(path.join(directory, base)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      if (x < 1 || y < 1 || x + width >= info.width || y + height >= info.height) throw new Error(`Invalid mouth placement: ${id}/${pose}`)
      const clean = Buffer.from(data)
      const skin = []
      for (let row = -1; row <= height; row++) for (let col = -1; col <= width; col++) {
        if (row !== -1 && row !== height && col !== -1 && col !== width) continue
        const offset = ((y + row) * info.width + x + col) * 4
        const color = [...data.subarray(offset, offset + 3)]
        if (data[offset + 3] >= 240 && color[0] > 170 && color[1] > 110 && color[2] > 80) skin.push({ col, row, color })
      }
      if (!skin.length) throw new Error(`No surrounding skin samples: ${id}/${pose}`)
      // Remove only the lip line; exclude the dark jaw contour from skin interpolation.
      for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
        const target = ((y + row) * info.width + x + col) * 4
        if (data[target] < 70 && data[target + 1] < 60) continue
        const total = [0, 0, 0]
        let weights = 0
        for (const sample of skin) {
          const weight = 1 / (1 + (sample.col - col) ** 2 + (sample.row - row) ** 2)
          weights += weight
          for (let channel = 0; channel < 3; channel++) total[channel] += sample.color[channel] * weight
        }
        for (let channel = 0; channel < 3; channel++) clean[target + channel] = Math.round(total[channel] / weights)
      }
      const frames = []
      for (let stage = 0; stage < 3; stage++) {
        const crop = crops[pose === 'front' ? 0 : 1][stage]
        const mouthWidth = (pose === 'front' ? [12, 14, 16] : [5, 7, 8])[stage]
        const mouthHeight = Math.min(height - 1, Math.round(crop.height * mouthWidth / crop.width))
        const mouth = await sharp(path.join(artwork, 'mouths.png')).extract(crop).resize(mouthWidth, mouthHeight).png().toBuffer()
        const file = `speak/${pose}/${String(stage + 1).padStart(3, '0')}.png`
        await mkdir(path.dirname(path.join(directory, file)), { recursive: true })
        const composed = await sharp(clean, { raw: info }).composite([{ input: mouth, left: x + Math.floor((width - mouthWidth) / 2), top: y + Math.floor((height - mouthHeight) / 2) }]).raw().toBuffer()
        const output = Buffer.from(data)
        for (let row = y; row < y + height; row++) for (let col = x; col < x + width; col++) {
          const offset = (row * info.width + col) * 4
          for (let channel = 0; channel < 3; channel++) output[offset + channel] = composed[offset + channel]
        }
        await sharp(output, { raw: info }).png().toFile(path.join(directory, file))
        frames.push(file)
      }
      const sequence = [[frames[0], 110], [frames[1], 100], [base, 100], [frames[2], 120], [frames[1], 90], [base, 210]]
      source.clips[`speak.${pose}`] = { loop: true, frames: sequence.map(([file, durationMs]) => ({ file, durationMs })) }
    }
    source.clips['speak.left'] = { alias: 'speak.right', mirrorX: true }
    source.clips['speak.seated-left'] = { alias: 'speak.seated-right', mirrorX: true }
    await writeFile(path.join(directory, 'character.json'), JSON.stringify(CharacterSourceSchema.parse(source), null, 2) + '\n')
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await createSpeechFrames()
  console.log('Created speech frames for residents without an independent mouth layer')
}
