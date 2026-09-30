import type { Point } from './model'

export const pathDistance = (points: Point[]) => points.slice(1).reduce((sum, p, i) => sum + Math.abs(p.x - points[i].x) + Math.abs(p.y - points[i].y), 0)
export const axisAligned = (a: Point, b: Point) => a.x === b.x || a.y === b.y

export function compactPath(points: Point[]): Point[] {
  const result: Point[] = []
  for (const point of points) {
    const previous = result.at(-1)
    if (previous?.x === point.x && previous.y === point.y) continue
    const before = result.at(-2)
    if (before && previous && ((before.x === previous.x && previous.x === point.x && (previous.y - before.y) * (point.y - previous.y) >= 0)
      || (before.y === previous.y && previous.y === point.y && (previous.x - before.x) * (point.x - previous.x) >= 0))) result.pop()
    result.push({ ...point })
  }
  return result
}

export function comparePaths(a: Point[], b: Point[]) {
  const difference = pathDistance(a) - pathDistance(b)
  return Math.abs(difference) > .001 ? difference : a.length - b.length
}

export function elbowPaths(from: Point, to: Point, clear: (a: Point, b: Point) => boolean): Point[][] {
  const candidates = axisAligned(from, to) ? [[from, to]] : [
    [from, { x: to.x, y: from.y }, to],
    [from, { x: from.x, y: to.y }, to],
  ]
  return candidates.map(compactPath).filter(points => points.slice(1).every((p, i) => clear(points[i], p)))
}

/** Shorten a four-way A* route without reintroducing diagonal corner cuts. */
export function shortenPath(points: Point[], clear: (a: Point, b: Point) => boolean): Point[] {
  const vertices = compactPath(points)
  const best: Point[][] = [[vertices[0]]]
  for (let end = 1; end < vertices.length; end++) {
    const candidates: Point[][] = []
    for (let start = 0; start < end; start++) {
      if (!best[start]) continue
      for (const link of elbowPaths(vertices[start], vertices[end], clear)) candidates.push(compactPath([...best[start], ...link.slice(1)]))
    }
    candidates.sort(comparePaths)
    if (candidates[0]) best[end] = candidates[0]
  }
  return best[vertices.length - 1] ?? []
}
