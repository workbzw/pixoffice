import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { rejectLegacyPublication } from './legacy-authoring.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { measureFrame } from './standard.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))

export async function registerMarvisStandard() {
  rejectLegacyPublication()
  const art = path.join(root, 'art/characters/marvis-standard-v1')
  const recipe = JSON.parse(await readFile(path.join(art, 'registration.json'), 'utf8'))
  const directory = path.join(root, 'art/characters/packs/marvis')
  const source = JSON.parse(await readFile(path.join(directory, 'character.json'), 'utf8'))
  const outputs = []
  for (const frame of recipe.frames) {
    const input = await sharp(path.join(art, recipe.sheet)).extract(frame.crop).png().toBuffer()
    const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const head = measureFrame(data, info.width, info.height, frame)
    const scale = recipe.headWidth / head.headWidth
    const width = Math.round(info.width * scale), height = Math.round(info.height * scale)
    const left = Math.round(source.pivot.x - ((head.headCenter + .5) * width / info.width - .5))
    const top = Math.round(source.pivot.y - head.footY * height / info.height)
    if (left <= 0 || top <= 0 || left + width >= source.canvas.width || top + height >= source.canvas.height) {
      throw new Error(`Registered frame exceeds canvas: ${frame.file}`)
    }
    const resized = await sharp(input).resize(width, height).png().toBuffer()
    const buffer = await sharp({ create: { ...source.canvas, channels: 4, background: '#00000000' } })
      .composite([{ input: resized, left, top }]).png().toBuffer()
    outputs.push({ file: frame.file, buffer })
  }
  // Original sheets and old pack frames remain untouched; always import from the source sheet.
  for (const { file, buffer } of outputs) {
    await mkdir(path.dirname(path.join(directory, file)), { recursive: true })
    await writeFile(path.join(directory, file), buffer)
  }
  source.clips['walk.back'].frames.forEach((frame, index) => { frame.file = outputs[index].file })
  await writeFile(path.join(directory, 'character.json'), JSON.stringify(source, null, 2) + '\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await registerMarvisStandard()
  console.log('Registered Marvis walking from the standard-v1 master sheet')
}
