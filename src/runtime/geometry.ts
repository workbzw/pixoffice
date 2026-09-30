import type { Point } from './model'

export function distanceToSegmentSquared(point: Point, from: Point, to: Point): number {
  const dx = to.x - from.x, dy = to.y - from.y
  const length = dx * dx + dy * dy
  const t = length ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / length)) : 0
  return (point.x - from.x - t * dx) ** 2 + (point.y - from.y - t * dy) ** 2
}
