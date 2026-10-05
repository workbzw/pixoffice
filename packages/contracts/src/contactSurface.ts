export type WorkPoint = { x: number; y: number }
export type WorkSurface = {
  keyboardLeft: WorkPoint
  keyboardRight: WorkPoint
  mouse: WorkPoint
  bounds: { left: number; right: number; back: number; front: number }
}

/** Render landmarks only. Floor occupancy remains in the integer-grid runtime. */
export function transformWorkSurface(surface: WorkSurface, scale: number, x = 0, y = 0): WorkSurface {
  const point = (p: WorkPoint) => ({ x: p.x * scale + x, y: p.y * scale + y })
  return {
    keyboardLeft: point(surface.keyboardLeft), keyboardRight: point(surface.keyboardRight), mouse: point(surface.mouse),
    bounds: { left: surface.bounds.left * scale + x, right: surface.bounds.right * scale + x,
      back: surface.bounds.back * scale + y, front: surface.bounds.front * scale + y },
  }
}

export function validWorkSurface(surface: WorkSurface) {
  const { left, right, back, front } = surface.bounds
  return [left, right, back, front].every(Number.isFinite) && left < right && back < front &&
    [surface.keyboardLeft, surface.keyboardRight, surface.mouse].every(p =>
      Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= left && p.x <= right && p.y >= back && p.y <= front)
}
