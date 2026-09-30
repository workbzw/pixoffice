import type { Box, Point, Template, World } from '../model'
import { SceneFault } from '../protocol'

export const FURNITURE_CELL_SIZE = 1
export const cellKey = (p: Point) => `${p.x},${p.y}`
export const sameCell = (a: Point, b: Point) => a.x === b.x && a.y === b.y
export const isCell = (p: Point) => Number.isInteger(p.x) && Number.isInteger(p.y)
export const cellDistance = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
export const addCell = (a: Point, b: Point) => ({ x: a.x + b.x, y: a.y + b.y })

export function furnitureFootprint(template: Template): Box { return { ...template.footprint } }
export function furnitureCells(template: Template): Point[] {
  const bounds = furnitureFootprint(template), cells: Point[] = []
  for (let y = bounds.top; y < bounds.bottom; y++) for (let x = bounds.left; x < bounds.right; x++) cells.push({ x, y })
  return cells
}
export function snapFurniture(point: Point): Point { return { x: Math.round(point.x), y: Math.round(point.y) } }

export function validateFurnitureFootprints(world: World, template: (id: string) => Template) {
  const occupied = new Map<string, string>()
  for (const prop of world.props) {
    if (!isCell(prop.position)) throw new SceneFault('INVALID_CELL', '家具位置必须是整数格')
    for (const offset of furnitureCells(template(prop.templateId))) {
      const p = addCell(prop.position, offset), b = world.bounds
      if (p.x < b.left || p.x >= b.right || p.y < b.top || p.y >= b.bottom) throw new SceneFault('OUT_OF_BOUNDS', `「${prop.name}」超出房间格子范围`)
      const other = occupied.get(cellKey(p))
      if (other) throw new SceneFault('OVERLAP', `「${prop.name}」与「${other}」占用了同一格`)
      occupied.set(cellKey(p), prop.name)
    }
  }
}
