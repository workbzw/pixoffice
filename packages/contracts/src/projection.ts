import type { WorldBox, WorldDirection, WorldPoint } from '@pixoffice/protocol/spatial'
import type { ViewDirection } from './animation.ts'
export type { WorldDirection } from '@pixoffice/protocol/spatial'
export { worldDirectionFromFacing } from '@pixoffice/protocol/spatial'
export type ScreenPoint = { x: number; y: number }
export type ScreenBounds = { left: number; top: number; right: number; bottom: number }

/** Projection coordinates are local to the scene, before viewport pan/zoom. */
export interface SceneProjection {
  readonly id: string
  gridToScreen(point: WorldPoint): ScreenPoint
  screenToGrid(point: ScreenPoint): WorldPoint
  cellCenter(cell: WorldPoint): ScreenPoint
  cellPolygon(cell: WorldPoint): ScreenPoint[]
  areaPolygon(area: WorldBox): ScreenPoint[]
  bounds(area: WorldBox): ScreenBounds
  depth(point: WorldPoint): number
  viewDirection(direction: WorldDirection): ViewDirection
}

export interface SceneRenderProfile {
  readonly antialias?: boolean
  readonly roundPixels?: boolean
  readonly backgroundColor?: number
  readonly pixelArt?: boolean
}
