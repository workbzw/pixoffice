import type { Point } from '../model'

// Tile borders, not image pixels. Furniture and actors share this room.
export const OFFICE_WALKABLE_AREA: Point[] = [
  { x: 4, y: 4 }, { x: 16, y: 4 },
  { x: 16, y: 12 }, { x: 4, y: 12 },
]
