import { readFile } from 'node:fs/promises'
import { rejectLegacyPublication } from './legacy-authoring.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = fileURLToPath(new URL('../../', import.meta.url))
// Authored crop/foot landmarks in the original sheets. Never resample an already calibrated PNG.
const poses = [
  { file: 'sit/back/001.png', source: 'seated.png', crop: { left: 147, top: 20, width: 272, height: 458 }, footY: 10 },
  { file: 'pose/lean/001.png', source: 'seat-transition-v1.png', crop: { left: 98, top: 33, width: 212, height: 327 }, footY: 8 },
  { file: 'pose/rise/001.png', source: 'seat-transition-v1.png', crop: { left: 98, top: 725, width: 209, height: 334 }, footY: 3 },
  { file: 'talk/seated-right/001.png', source: 'seated-turn-right-v1.png', crop: { left: 139, top: 15, width: 283, height: 471 }, footY: 10 },
]

function headBounds(data, width, height) {
  let left = width, right = -1
  // This band contains Marvis's hair silhouette, excluding the arms and body.
  for (let y = 0; y < Math.floor(height * .45); y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] < 128) continue
    left = Math.min(left, x); right = Math.max(right, x)
  }
  if (right <= left) throw new Error('Marvis source pose has no measurable head')
  return { width: right - left + 1, center: (left + right) / 2 }
}

export async function registerMarvisPoses() {
  rejectLegacyPublication()
  const directory = path.join(root, 'art/characters/packs/marvis')
  const source = JSON.parse(await readFile(path.join(directory, 'character.json'), 'utf8'))
  const legacy = path.join(root, 'public/assets/characters/apartment')
  const reference = await sharp(path.join(legacy, 'marvis.png')).extract({ left: 126, top: 725, width: 183, height: 340 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const targetWidth = headBounds(reference.data, reference.info.width, reference.info.height).width * source.referenceHeight / reference.info.height
  const outputs = []
  for (const pose of poses) {
    const input = await sharp(path.join(legacy, pose.source)).extract(pose.crop).png().toBuffer()
    const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const head = headBounds(data, info.width, info.height)
    const scale = targetWidth / head.width
    const width = Math.round(info.width * scale), height = Math.round(info.height * scale)
    const left = Math.round(source.pivot.x - ((head.center + .5) * width / info.width - .5))
    const top = Math.round(source.pivot.y + pose.footY * source.referenceHeight / source.displayHeight - height)
    if (left <= 0 || top <= 0 || left + width >= source.canvas.width || top + height >= source.canvas.height) throw new Error(`Calibrated pose exceeds canvas: ${pose.file}`)
    const image = await sharp(input).resize(width, height).png().toBuffer()
    const buffer = await sharp({ create: { ...source.canvas, channels: 4, background: '#00000000' } }).composite([{ input: image, left, top }]).png().toBuffer()
    outputs.push({ file: path.join(directory, pose.file), buffer })
  }
  // Validate every pose before replacing any output. Original sheets remain untouched.
  const { writeFile } = await import('node:fs/promises')
  for (const output of outputs) await writeFile(output.file, output.buffer)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await registerMarvisPoses()
  console.log('Registered Marvis seat poses to the standing head scale')
}
