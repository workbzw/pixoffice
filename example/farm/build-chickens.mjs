import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

export async function buildChickens(source, output, corrections) {
  const original = await sharp(source).metadata(), replacement = await sharp(corrections).metadata()
  const width = 192, height = 160, pivot = { x: 96, y: 146 }
  // Reviewed row gutters: the generated pecking rows are slightly closer together.
  const rowEdges = [0, 256, 512, 768, 1000, 1240, 1536].map(y => Math.round(y * original.height / 1536))
  const clips = {}, layers = [], registration = []
  for (const [row, id] of ['walk.left', 'walk.back', 'walk.front', 'peck.left', 'peck.back', 'peck.front'].entries()) {
    clips[id] = []
    const replacementRow = id === 'walk.left' ? 0 : id === 'peck.back' ? 1 : -1
    const meta = replacementRow >= 0 ? replacement : original
    const input = replacementRow >= 0 ? corrections : source
    const scale = replacementRow >= 0 ? .28 * 1280 / replacement.height : .55
    const top = replacementRow >= 0 ? Math.floor(replacementRow * meta.height / 2) : rowEdges[row]
    const bottom = replacementRow >= 0 ? Math.floor((replacementRow + 1) * meta.height / 2) : rowEdges[row + 1]
    for (let col = 0; col < 4; col++) {
      const left = Math.floor(col * meta.width / 4)
      const cell = { left, top, width: Math.floor((col + 1) * meta.width / 4) - left, height: bottom - top }
      const raw = await sharp(input).extract(cell).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      let minX = cell.width, maxX = -1, minY = cell.height, maxY = -1
      for (let y = 0; y < cell.height; y++) for (let x = 0; x < cell.width; x++) if (raw.data[(y * cell.width + x) * 4 + 3] >= 32) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y)
      }
      if (maxX < minX) throw new Error(`Missing chicken frame ${id}:${col}`)
      let footLeft = cell.width, footRight = -1, footBottom = -1
      for (let y = Math.max(minY, maxY - 23); y <= maxY; y++) for (let x = minX; x <= maxX; x++) if (raw.data[(y * cell.width + x) * 4 + 3] >= 128) {
        footLeft = Math.min(footLeft, x); footRight = Math.max(footRight, x); footBottom = Math.max(footBottom, y)
      }
      if (footRight < footLeft) throw new Error(`Missing chicken ground contact ${id}:${col}`)
      const crop = { left: Math.max(0, minX - 2), top: Math.max(0, minY - 2), width: Math.min(cell.width - 1, maxX + 2) - Math.max(0, minX - 2) + 1, height: Math.min(cell.height - 1, maxY + 2) - Math.max(0, minY - 2) + 1 }
      const target = { width: Math.round(crop.width * scale), height: Math.round(crop.height * scale) }
      const ground = { x: (footLeft + footRight + 1) / 2, y: footBottom + 1 }
      const x = Math.round(pivot.x - (ground.x - crop.left) * target.width / crop.width), y = Math.round(pivot.y - (ground.y - crop.top) * target.height / crop.height)
      if (x < 1 || y < 1 || x + target.width >= width || y + target.height >= height) throw new Error(`Chicken frame overflows ${id}:${col}`)
      const image = await sharp(raw.data, { raw: raw.info }).extract(crop).resize(target.width, target.height).png().toBuffer()
      if (id === 'walk.front' && col === 0) {
        await sharp(raw.data, { raw: raw.info }).extract(crop)
          .resize(112, 112, { fit: 'contain', background: '#00000000' })
          .extend({ top: 8, bottom: 8, left: 8, right: 8, background: '#00000000' })
          .webp({ quality: 90, alphaQuality: 100 }).toFile(path.join(output, 'chicken-logo.webp'))
      }
      layers.push({ input: image, left: col * width + x, top: row * height + y })
      clips[id].push({ x: col * width, y: row * height, width, height })
      registration.push({ id, frame: col, source: path.basename(input), cell, crop, ground, scale, translate: { x, y } })
    }
  }
  await sharp({ create: { width: width * 4, height: height * 6, channels: 4, background: '#00000000' } }).composite(layers).webp({ quality: 90, alphaQuality: 100 }).toFile(path.join(output, 'chickens.webp'))
  await writeFile(path.join(output, 'chickens.json'), JSON.stringify({ canvas: { width, height }, pivot, clips, registration }, null, 2) + '\n')
}
