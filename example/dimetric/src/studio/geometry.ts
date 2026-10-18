import { createDimetricProjection } from '@pixoffice/renderer-pixi/projection'
const projection = createDimetricProjection(140)
export const roomSize = { width: 1536, height: 1024 }
export const boardBox = { left: 413, top: 140, width: 780, height: 585 }
export function project(point: { x: number; y: number }) {
  const screen = projection.gridToScreen(point)
  return { x: screen.x + 768, y: screen.y + 265 }
}
export const stationPoint = (position: { x: number; y: number }) => project({ x: position.x + 1, y: position.y + 1 })
