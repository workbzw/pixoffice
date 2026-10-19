import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = fileURLToPath(new URL('../public/assets/office/', import.meta.url))
export const OFFICE_IMAGES = ['office', 'desk', 'chair', 'workstation-trial-v1/desk', 'workstation-trial-v1/chair', 'workstation-trial-v1/computer', 'reference-v1/room-whiteboard-v3', 'reference-v1/conference-table', 'reference-v1/desk-accessories', 'effects/work-crafting-lite-v1']

export async function buildOfficeCraftingAtlas(source) {
  const frames = []
  for (const [i, frame] of [0, 2, 4, 6, 8, 11].entries()) {
    const input = await sharp(source).extract({ left: frame % 4 * 362, top: Math.floor(frame / 4) * 362, width: 362, height: 362 })
      .resize(160, 160).png().toBuffer()
    frames.push({ input, left: i % 3 * 160, top: Math.floor(i / 3) * 160 })
  }
  return sharp({ create: { width: 480, height: 320, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(frames).png().toBuffer()
}

async function publish(output, bytes) {
  let current
  try { current = await readFile(output) } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (current?.equals(bytes)) return
  await mkdir(path.dirname(output), { recursive: true })
  const temporary = `${output}.tmp-${process.pid}`
  await writeFile(temporary, bytes)
  await rename(temporary, output)
}

export async function buildOfficeAssets(directory = root) {
  const results = []
  for (const name of OFFICE_IMAGES) {
    const png = path.join(directory, `${name}.png`)
    const artSource = name === 'effects/work-crafting-lite-v1' && path.resolve(directory) === path.resolve(root)
      ? fileURLToPath(new URL('../art/office/work-crafting-v1/spritesheet-small-tools-white-smoke.png', import.meta.url)) : png
    const source = await readFile(artSource)
    const original = artSource !== png ? await buildOfficeCraftingAtlas(source) : source
    if (artSource !== png) await publish(png, original)
    const webp = await sharp(original).webp({ lossless: true, effort: 4 }).toBuffer()
    const output = path.join(directory, `${name}.webp`)
    await publish(output, webp)
    results.push({ name, originalBytes: original.length, webpBytes: webp.length })
  }
  return results
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = await buildOfficeAssets()
  console.log(`Office WebP assets built: ${results.length}`)
}
