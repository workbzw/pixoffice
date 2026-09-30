import type { Point } from './model'
import { SceneFault } from './protocol'

/** Convex floor boundaries keep every straight segment between valid endpoints inside the room. */
export function convexAreaContains(vertices: Point[]) {
  const area = vertices.reduce((sum, p, i) => {
    const next = vertices[(i + 1) % vertices.length]
    return sum + p.x * next.y - next.x * p.y
  }, 0)
  const fail = () => { throw new SceneFault('INVALID_WALKABLE_AREA', '可行走区域必须是无交叉的凸多边形') }
  if (vertices.length < 3 || !Number.isFinite(area) || Math.abs(area) < .001) fail()
  const sign = Math.sign(area)
  const edges = vertices.map((from, i) => {
    const to = vertices[(i + 1) % vertices.length], dx = to.x - from.x, dy = to.y - from.y
    const length = Math.hypot(dx, dy)
    if (length < .001) fail()
    return { from, nx: -dy * sign / length, ny: dx * sign / length }
  })
  const contains = (point: Point, clearance = 0) => edges.every(({ from, nx, ny }) =>
    (point.x - from.x) * nx + (point.y - from.y) * ny >= clearance - 1e-6)
  if (vertices.some(point => !contains(point))) fail()
  return contains
}
