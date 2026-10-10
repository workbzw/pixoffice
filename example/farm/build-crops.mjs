import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import sharp from 'sharp'

export async function buildCrops(sourceRoot, output) {
  await sharp(path.join(sourceRoot, 'soil.png')).trim({ threshold: 10 }).resize(480, 320, { fit: 'fill' }).webp({ lossless: true }).toFile(path.join(output, 'soil.webp'))
  const source = path.join(sourceRoot, 'plants.png'), meta = await sharp(source).metadata(), pieces = []
  const rows = [0, .287, .594, 1]
  for (const [column, crop] of ['carrot', 'tomato', 'cabbage'].entries()) for (let row = 0; row < 3; row++) {
    const left = Math.floor(column * meta.width / 3), top = Math.floor(rows[row] * meta.height)
    const region = { left, top, width: Math.floor((column + 1) * meta.width / 3) - left, height: Math.floor(rows[row + 1] * meta.height) - top }
    const { data, info } = await sharp(source).extract(region).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let minX = info.width, minY = info.height, maxX = -1, maxY = -1
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 32) {
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
    }
    if (maxX < minX) throw new Error(`Empty farm plant: ${crop}-${row + 1}`)
    const bounds = { left: region.left + minX, top: region.top + minY, width: maxX - minX + 1, height: maxY - minY + 1 }
    let groundSum = 0, groundWeight = 0
    for (let y = Math.max(minY, maxY - 5); y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const alpha = data[(y * info.width + x) * 4 + 3]
      if (alpha > 32) { groundSum += x * alpha; groundWeight += alpha }
    }
    pieces.push({ crop, stage: row + 1, bounds, groundX: groundSum / groundWeight - minX })
  }
  const scale = Math.min(...pieces.flatMap(p => [232 / p.bounds.width, 228 / p.bounds.height]))
  const registration = { schemaVersion: 1, canvas: { width: 256, height: 256 }, pivot: { x: 128, y: 240 }, scale, plants: [] }
  for (const piece of pieces) {
    const width = Math.max(1, Math.round(piece.bounds.width * scale)), height = Math.max(1, Math.round(piece.bounds.height * scale))
    const left = Math.round(128 - piece.groundX * width / piece.bounds.width), top = 240 - height
    if (left < 0 || left + width > 256) throw new Error(`Farm plant overflows its registered canvas: ${piece.crop}-${piece.stage}`)
    const image = await sharp(source).extract(piece.bounds).resize(width, height).png().toBuffer()
    const file = `plant-${piece.crop}-${piece.stage}.webp`
    await sharp({ create: { width: 256, height: 256, channels: 4, background: '#00000000' } }).composite([{ input: image, left, top }]).webp({ lossless: true }).toFile(path.join(output, file))
    registration.plants.push({ file, source: piece.bounds, groundX: piece.groundX, left, top, width, height })
  }
  await writeFile(path.join(output, 'crop-registration.json'), JSON.stringify(registration, null, 2) + '\n')
}
