import { GridNavigation } from '@pixoffice/runtime/navigation'
import type { NavigationTemplates } from '@pixoffice/runtime/navigationAdapter'
import type { Point, World } from '@pixoffice/runtime/model'

type Facing = 'front' | 'back' | 'left' | 'right'
type ChickenMode = 'walk' | 'peck'
export type FarmChicken = { id: string; position: Point; facing: Facing; mode: ChickenMode; elapsedMs: number; visible: boolean }
type Chicken = FarmChicken & { cell: Point; path: Point[]; stepMs: number; waitMs: number }
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y
const STEP_MS = 760
// The painted foreground fence occupies row 15; keep foot pivots on the inner lawn.
const YARD_BOUNDS = { left: 2, top: 4, right: 22, bottom: 15 }
function chickenGround(world: World): World {
  const bounds = world.bounds
  return { ...world, bounds: {
    left: Math.max(bounds.left, YARD_BOUNDS.left), top: Math.max(bounds.top, YARD_BOUNDS.top),
    right: Math.min(bounds.right, YARD_BOUNDS.right), bottom: Math.min(bounds.bottom, YARD_BOUNDS.bottom),
  } }
}

/** Decorative flock: reuse the scene's grid rules without creating worker tasks. */
export function createFarmFlock(world: World, templates: NavigationTemplates, random: () => number = Math.random) {
  const navigation = new GridNavigation(templates)
  const chickens: Chicken[] = [{ x: 8, y: 9 }, { x: 15, y: 14 }].map((cell, i) => ({
    id: `chicken-${i + 1}`, cell, position: { ...cell }, path: [], facing: i ? 'left' : 'front',
    mode: 'peck', elapsedMs: 0, stepMs: 0, waitMs: 16000 + i * 4500, visible: true,
  }))
  const duration = () => 16000 + random() * 12000
  function obstacles(current: Chicken, state: World) {
    return [...state.actors.flatMap(actor => [actor.position, ...(actor.step ? [actor.step.from, actor.step.to] : [])]),
      ...chickens.filter(c => c !== current && c.visible).flatMap(c => [c.cell, ...c.path.slice(0, 1)])]
      .filter(position => !same(position, current.cell)).map(position => ({ position }))
  }
  function place(current: Chicken, state: World) {
    const free: Point[] = []
    for (let y = state.bounds.top; y < state.bounds.bottom; y++) for (let x = state.bounds.left; x < state.bounds.right; x++) {
      const point = { x, y }
      if (navigation.walkable(state, point, { obstacles: obstacles(current, state) })) free.push(point)
    }
    free.sort((a, b) => Math.abs(a.x - current.cell.x) + Math.abs(a.y - current.cell.y) - Math.abs(b.x - current.cell.x) - Math.abs(b.y - current.cell.y))
    current.visible = free.length > 0
    if (free[0]) { current.cell = free[0]; current.position = { ...free[0] } }
    current.path = []; current.stepMs = 0; current.mode = 'peck'; current.elapsedMs = 0
  }
  function feed(current: Chicken) {
    current.mode = 'peck'
    current.elapsedMs = 0; current.waitMs = duration(); current.path = []; current.stepMs = 0
  }
  function roam(current: Chicken, state: World) {
    const query = { obstacles: obstacles(current, state) }
    for (let attempt = 0; attempt < 20; attempt++) {
      const target = { x: current.cell.x + Math.floor(random() * 5) - 2, y: current.cell.y + Math.floor(random() * 5) - 2 }
      if (same(target, current.cell) || !navigation.walkable(state, target, query)) continue
      try {
        const path = navigation.path(state, current.cell, target, query)
        if (!path.length || path.length > 3) continue
        current.path = path; current.mode = 'walk'; current.elapsedMs = 0; current.stepMs = 0
        return
      } catch { /* A new obstacle can make an otherwise free destination unreachable. */ }
    }
    feed(current)
  }
  for (const chicken of chickens) place(chicken, chickenGround(world))
  return {
    tick(elapsedMs: number, state: World) {
      if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return
      const dt = Math.min(elapsedMs, 250)
      const ground = chickenGround(state)
      for (const chicken of chickens) {
        if (!chicken.visible || !navigation.walkable(ground, chicken.cell)) place(chicken, ground)
        if (!chicken.visible) continue
        chicken.elapsedMs += dt
        if (chicken.mode !== 'walk') {
          if (chicken.elapsedMs >= chicken.waitMs) roam(chicken, ground)
          continue
        }
        const next = chicken.path[0]
        if (!next || !navigation.walkable(ground, next) || chicken.stepMs === 0 && !navigation.walkable(ground, next, { obstacles: obstacles(chicken, ground) })) {
          chicken.position = { ...chicken.cell }; feed(chicken); continue
        }
        chicken.facing = next.x !== chicken.cell.x ? next.x > chicken.cell.x ? 'right' : 'left' : next.y > chicken.cell.y ? 'front' : 'back'
        chicken.stepMs = Math.min(STEP_MS, chicken.stepMs + dt)
        const progress = chicken.stepMs / STEP_MS
        chicken.position = { x: chicken.cell.x + (next.x - chicken.cell.x) * progress, y: chicken.cell.y + (next.y - chicken.cell.y) * progress }
        if (progress === 1) {
          chicken.cell = next; chicken.path.shift(); chicken.stepMs = 0
          if (!chicken.path.length) feed(chicken)
        }
      }
    },
    read(): FarmChicken[] {
      return chickens.map(({ id, position, facing, mode, elapsedMs, visible }) => ({ id, position: { ...position }, facing, mode, elapsedMs, visible }))
    },
  }
}
