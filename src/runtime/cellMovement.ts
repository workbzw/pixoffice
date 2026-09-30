import type { Actor, Point, World } from './model'
import { facingToward } from './model'
import { sameCell, cellDistance } from './map/furnitureGrid'
import type { NavigationAdapter, NavigationQuery } from './navigationAdapter'
import { SceneFault } from './protocol'

export const CELL_STEP_MS = 480
export function occupiedCells(world: World, exceptId: string): Point[] {
  return world.actors.filter(a => a.id !== exceptId).flatMap(a => [a.position, ...(a.step ? [a.step.to] : []),
    ...(a.seatTransition?.reserved ? a.seatTransition.passage : [])])
}
export function cellAvailable(world: World, actor: Actor, cell: Point) {
  return !occupiedCells(world, actor.id).some(p => sameCell(p, cell))
}

/** Position changes only at cell boundaries. A committed edge owns both ends. */
export function advanceCell(world: World, actor: Actor, target: Point, dt: number, navigation: NavigationAdapter, query: NavigationQuery = {}, durationMs = CELL_STEP_MS) {
  if (!actor.step) {
    if (sameCell(actor.position, target)) return 'arrived' as const
    if (cellDistance(actor.position, target) !== 1) throw new SceneFault('INVALID_STEP', '人物每步只能进入上下左右的相邻格')
    if (!navigation.segmentClear(world, actor.position, target, query) || !cellAvailable(world, actor, target)) return 'blocked' as const
    actor.step = { from: { ...actor.position }, to: { ...target }, elapsedMs: 0, durationMs }
    actor.facing = facingToward(actor.position, target)
  }
  actor.step.elapsedMs = Math.min(actor.step.durationMs, actor.step.elapsedMs + dt)
  if (actor.step.elapsedMs < actor.step.durationMs) return 'moving' as const
  actor.position = { ...actor.step.to }; actor.step = undefined
  return 'arrived' as const
}
