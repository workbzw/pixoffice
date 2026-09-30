import type { Actor, Point, Prop, SeatTransition } from '@/runtime/model'
import { facingToward } from '@/runtime/model'
import { sameCell } from '@/runtime/map/furnitureGrid'
import { CELL_STEP_MS } from '@/runtime/cellMovement'

// Pixel scale belongs exclusively to rendering, never to map/command coordinates.
export const CELL_PIXELS = 50
export const cellCenter = (p: Point) => ({ x: (p.x + .5) * CELL_PIXELS, y: (p.y + .5) * CELL_PIXELS })
export function propPixels(prop: Prop) {
  return { x: prop.position.x * CELL_PIXELS + 50, y: prop.position.y * CELL_PIXELS + (prop.templateId === 'office.workstation' ? 20 : 25) }
}
export const seatPixels = (cell: Point) => { const p = cellCenter(cell); return { x: p.x + 25, y: p.y - 10 } }

function dockingPoint(cell: Point, transition: SeatTransition): Point {
  const floor = cellCenter(cell)
  return sameCell(cell, transition.seat) ? { x: seatPixels(cell).x, y: floor.y } : floor
}

const pathLengths = (path: Point[]) => path.slice(1).map((p, i) => Math.abs(p.x - path[i].x) + Math.abs(p.y - path[i].y))

function sampleDockingPath(path: Point[], progress: number, facing: Actor['facing']) {
  const lengths = pathLengths(path)
  let remaining = lengths.reduce((sum, length) => sum + length, 0) * progress
  for (let i = 0; i < lengths.length; i++) {
    const from = path[i], to = path[i + 1], length = lengths[i]
    if (remaining <= length || i === lengths.length - 1) {
      const fraction = Math.min(1, remaining / length)
      return { position: { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction }, facing: facingToward(from, to) }
    }
    remaining -= length
  }
  return { position: path[0], facing }
}

/** Only align the final standing point with the chair; all walking stays on the floor. */
export function seatStepPixels(from: Point, to: Point, transition: SeatTransition): Point[] {
  const outward = transition.passage.findIndex(p => sameCell(p, from)) < transition.passage.findIndex(p => sameCell(p, to))
  const start = dockingPoint(outward ? from : to, transition), end = dockingPoint(outward ? to : from, transition)
  const path = [start, { x: start.x, y: end.y }, end]
  const vertices = path.filter((p, i) => i === 0 || !sameCell(p, path[i - 1]))
  return outward ? vertices : vertices.reverse()
}

export function seatStepDurationMs(from: Point, to: Point, transition: SeatTransition): number {
  if (transition.interactionId !== 'seat') return CELL_STEP_MS
  const distance = pathLengths(seatStepPixels(from, to, transition)).reduce((sum, length) => sum + length, 0)
  return distance / CELL_PIXELS * CELL_STEP_MS
}

export function actorVisualPose(actor: Actor): { position: Point; facing: Actor['facing'] } {
  const transition = actor.seatTransition
  if (transition?.interactionId === 'seat') {
    if (transition.stage === 'rising' || transition.stage === 'sitting') {
      const seat = seatPixels(transition.seat), stand = dockingPoint(transition.seat, transition)
      return { position: { x: seat.x, y: stand.y + (seat.y - stand.y) * transition.seatedAmount }, facing: actor.facing }
    }
    const target = actor.step?.to ?? transition.target
    if (target && !sameCell(actor.position, target)) {
      const progress = actor.step ? actor.step.elapsedMs / actor.step.durationMs : 0
      return sampleDockingPath(seatStepPixels(actor.position, target, transition), progress, actor.facing)
    }
    return { position: dockingPoint(actor.position, transition), facing: actor.facing }
  }
  const from = cellCenter(actor.position), step = actor.step
  const progress = step ? step.elapsedMs / step.durationMs : 0
  const target = step && cellCenter(step.to)
  const position = target ? { x: from.x + (target.x - from.x) * progress, y: from.y + (target.y - from.y) * progress } : from
  return { position: actor.posture === 'seated' ? seatPixels(actor.position) : position, facing: actor.facing }
}

export function actorPixels(actor: Actor): Point { return actorVisualPose(actor).position }
