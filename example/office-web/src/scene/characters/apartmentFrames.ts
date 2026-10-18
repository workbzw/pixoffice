// Atlas import and registration only; live playback belongs to FrameAdapter.
export type SpriteFrame = { x: number; y: number; width: number; height: number }

export const APARTMENT_EMOTES = [
  { label: '挥手', animation: 'emotes/wave' },
  { label: '思考表情', animation: 'emotes/thinking' },
  { label: '惊讶', animation: 'emotes/surprised' },
] as const

// Generated sheets have slightly uneven spacing. Locate transparent gutters,
// then trim each pose independently so the feet remain anchored during animation.
export function detectApartmentFrames(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  rowCount = 4,
  columnCount = 3,
): SpriteFrame[] {
  if (!Number.isInteger(rowCount) || rowCount < 1 || !Number.isInteger(columnCount) || columnCount < 1 || width < columnCount * 4 || height < rowCount * 4 || rgba.length !== width * height * 4) {
    throw new Error('Invalid character sheet dimensions')
  }
  const opaqueRows = new Uint32Array(height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] >= 64) opaqueRows[y]++
    }
  }
  const rows = [0]
  for (let row = 1; row < rowCount; row++) {
    const center = height * row / rowCount
    const radius = Math.floor(height / (rowCount * 4))
    let nearest = -1
    for (let y = Math.floor(center) - radius; y <= center + radius; y++) {
      if (opaqueRows[y] === 0 && (nearest < 0 || Math.abs(y - center) < Math.abs(nearest - center))) {
        nearest = y
      }
    }
    if (nearest < 0) throw new Error('Character sheet is missing a transparent row gutter')
    rows.push(nearest)
  }
  rows.push(height)

  const frames: SpriteFrame[] = []
  for (let row = 0; row < rowCount; row++) {
    const top = rows[row]
    const bottom = rows[row + 1]
    const opaqueColumns = new Uint32Array(width)
    for (let y = top; y < bottom; y++) {
      for (let x = 0; x < width; x++) {
        if (rgba[(y * width + x) * 4 + 3] >= 64) opaqueColumns[x]++
      }
    }
    const columns = [0]
    for (let col = 1; col < columnCount; col++) {
      const center = width * col / columnCount
      const radius = Math.floor(width / (columnCount * 4))
      let nearest = -1
      for (let x = Math.floor(center) - radius; x <= center + radius; x++) {
        if (opaqueColumns[x] === 0 && (nearest < 0 || Math.abs(x - center) < Math.abs(nearest - center))) nearest = x
      }
      if (nearest < 0) throw new Error('Character sheet is missing a transparent column gutter')
      columns.push(nearest)
    }
    columns.push(width)
    for (let col = 0; col < columnCount; col++) {
      const left = columns[col]
      const right = columns[col + 1]
      let minX = right, minY = bottom, maxX = left - 1, maxY = top - 1
      for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) {
          if (rgba[(y * width + x) * 4 + 3] < 64) continue
          minX = Math.min(minX, x)
          minY = Math.min(minY, y)
          maxX = Math.max(maxX, x)
          maxY = Math.max(maxY, y)
        }
      }
      if (maxX < minX || maxY - minY < height / (rowCount * 2)) {
        throw new Error(`Character pose ${row * columnCount + col} is empty or incomplete`)
      }
      minX = Math.max(left, minX - 2)
      minY = Math.max(top, minY - 2)
      maxX = Math.min(right - 1, maxX + 2)
      maxY = Math.min(bottom - 1, maxY + 2)
      frames.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    }
  }
  return frames
}

export function registerWalkFrames(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  frames = detectApartmentFrames(rgba, width, height, 2, 4),
) {
  // Register to the head center, not the changing silhouette of swinging arms.
  const centers = frames.map(frame => {
    let left = width, right = 0
    for (let y = frame.y; y < frame.y + Math.floor(frame.height * 0.42); y++) {
      for (let x = frame.x; x < frame.x + frame.width; x++) {
        if (rgba[(y * width + x) * 4 + 3] < 64) continue
        left = Math.min(left, x)
        right = Math.max(right, x)
      }
    }
    if (left > right) throw new Error('Walk frame is missing its head')
    return Math.round((left + right) / 2)
  })
  const leftExtent = Math.max(...frames.map((frame, index) => centers[index] - frame.x))
  const rightExtent = Math.max(...frames.map((frame, index) => frame.x + frame.width - centers[index]))
  const frameSize = { width: leftExtent + rightExtent, height: Math.max(...frames.map(frame => frame.height)) }
  return {
    frames,
    frameSize,
    offsets: frames.map((frame, index) => ({
      x: leftExtent - (centers[index] - frame.x),
      y: frameSize.height - frame.height,
    })),
  }
}
