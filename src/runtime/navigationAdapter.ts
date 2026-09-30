import type { Point, Template, World } from './model'

export interface NavigationTemplates {
  template(id: string): Template
}

/** Each obstacle reserves one complete cell. */
export type NavigationObstacle = { position: Point }
export type NavigationQuery = {
  obstacles?: NavigationObstacle[]
  /** Internal furniture contact permission, never exposed as a protocol parameter. */
  contact?: { propId: string; interactionId: string }
  /** Restricts local furniture transitions to their declared corridor cells. */
  within?: Point[]
}

/** Routes are axis-aligned, exclude the start, end at the exact target, honor obstacles, and never mutate the world. */
export interface NavigationAdapter {
  anchor(world: World, targetId: string, anchor: string): Point
  walkable(world: World, point: Point, query?: NavigationQuery): boolean
  segmentClear(world: World, from: Point, to: Point, query?: NavigationQuery): boolean
  path(world: World, from: Point, to: Point, query?: NavigationQuery): Point[]
  validate(world: World, options?: { connectivity?: boolean }): void
}

export type NavigationFactory = (templates: NavigationTemplates) => NavigationAdapter
