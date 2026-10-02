import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = fileURLToPath(new URL('../public/assets/office/', import.meta.url))
export const OFFICE_IMAGES = ['office', 'desk', 'chair', 'workstation-trial-v1/desk', 'workstation-trial-v1/chair', 'workstation-trial-v1/computer']

export async function buildOfficeAssets(directory = root) {
  const results = []
  for (const name of OFFICE_IMAGES) {
    const original = await readFile(path.join(directory, `${name}.png`))
    const webp = await sharp(original).webp({ lossless: true, effort: 4 }).toBuffer()
    const output = path.join(directory, `${name}.webp`)
    let current
    try { current = await readFile(output) } catch (error) { if (error.code !== 'ENOENT') throw error }
    if (!current?.equals(webp)) {
      await mkdir(path.dirname(output), { recursive: true })
      const temporary = `${output}.tmp-${process.pid}`
      await writeFile(temporary, webp)
      await rename(temporary, output)
    }
    results.push({ name, originalBytes: original.length, webpBytes: webp.length })
  }
  return results
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = await buildOfficeAssets()
  console.log(`Office WebP assets built: ${results.length}`)
}
