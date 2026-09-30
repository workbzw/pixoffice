import type { Actor, Point, World, FurnitureInteraction } from './model'
import type { NavigationAdapter, NavigationObstacle, NavigationTemplates } from './navigationAdapter'
import { SceneFault } from './protocol'
import { addCell, sameCell } from './map/furnitureGrid'
import { advanceCell, occupiedCells, cellAvailable, CELL_STEP_MS } from './cellMovement'

export type SeatPort = { propId: string; interactionId: string; seat: Point; approach: Point; passage: Point[]; config: FurnitureInteraction }
export type SeatStepDuration = (from: Point, to: Point, transition: NonNullable<Actor['seatTransition']>) => number
const POSTURE_MS = 520

/** Furniture use is a reserved local path, not a general permission to cross furniture. */
export class SeatInteractions {
  private active = new Map<string, { port: SeatPort; vertices: Point[]; index: number; blockedMs: number; direction: 'enter' | 'exit' }>()
  private navigation: NavigationAdapter
  private templates: NavigationTemplates
  private stepDuration: SeatStepDuration
  constructor(navigation: NavigationAdapter, templates: NavigationTemplates, stepDuration: SeatStepDuration = () => CELL_STEP_MS) {
    this.navigation = navigation; this.templates = templates; this.stepDuration = stepDuration
  }
  config(world: World, propId: string, interactionId = 'seat') {
    const prop = world.props.find(p => p.id === propId)
    return prop ? this.templates.template(prop.templateId).interactions?.[interactionId] : undefined
  }
  ports(world: World, propId: string, interactionId = 'seat'): SeatPort[] {
    const prop = world.props.find(p => p.id === propId), config = this.config(world, propId, interactionId)
    if (!prop || !config) throw new SceneFault('INTERACTION_NOT_SUPPORTED', '家具没有这项交互')
    const seat = this.navigation.anchor(world, propId, config.anchor)
    return config.approaches.flatMap(anchor => {
      const approach = this.navigation.anchor(world, propId, anchor)
      if (!this.navigation.walkable(world, approach)) return []
      try {
        const within = [approach, seat, ...config.cells.map(c => addCell(prop.position, c))]
        const path = this.navigation.path(world, seat, approach, { contact: { propId, interactionId }, within })
        return [{ propId, interactionId, seat, approach, passage: [seat, ...path], config }]
      } catch { return [] }
    })
  }
  obstacles(world: World, actorId: string): NavigationObstacle[] {
    return occupiedCells(world, actorId).map(position => ({ position }))
  }
  passageClear(world: World, actorId: string, port: SeatPort) {
    const actor = world.actors.find(a => a.id === actorId)!
    return port.passage.every(p => cellAvailable(world, actor, p))
  }
  begin(actor: Actor, port: SeatPort, direction: 'enter' | 'exit') {
    const vertices = direction === 'enter' ? [...port.passage].reverse() : port.passage
    this.active.set(actor.id, { port, vertices, index: 1, blockedMs: 0, direction })
    actor.expression = undefined
    actor.seatTransition = { propId: port.propId, interactionId: port.interactionId, seat: port.seat, approach: port.approach, passage: port.passage,
      stage: direction === 'exit' && port.config.posture === 'seated' ? 'rising' : 'aligning', progress: 0, seatedAmount: direction === 'exit' && port.config.posture === 'seated' ? 1 : 0 }
    if (direction === 'exit') actor.facing = port.config.facing
  }
  recover(actor: Actor) {
    const t = actor.seatTransition, state = this.active.get(actor.id)
    if (!t || !state) return
    state.blockedMs = 0
    if (t.stage === 'aligning' && !actor.step) { actor.seatTransition = undefined; this.active.delete(actor.id); return }
    if (t.stage === 'rising') { t.stage = 'sitting'; t.progress = 1 - t.progress; return }
    if (t.stage === 'sitting') return
    // Finish the reserved edge before returning along the cells already traversed.
    const travelled = state.vertices.slice(0, state.index)
    state.vertices = actor.step ? [actor.position, actor.step.to, ...travelled.reverse()] : [actor.position, ...travelled.slice(0, -1).reverse()]
    state.vertices = state.vertices.filter((p, i, a) => i === 0 || !sameCell(p, a[i - 1]))
    state.index = 1; state.direction = state.direction === 'enter' ? 'exit' : 'enter'; t.stage = state.direction === 'enter' ? 'entering' : 'exiting'; t.progress = 0
    t.target = state.vertices[1]
  }
  advance(world: World, actor: Actor, dt: number, recovering = false) {
    const t = actor.seatTransition, state = this.active.get(actor.id)
    if (!t || !state) return
    const { port } = state
    const finish = (entered: boolean) => {
      actor.posture = entered ? port.config.posture : 'standing'
      actor.using = entered ? { propId: port.propId, interactionId: port.interactionId } : undefined
      if (entered) actor.facing = port.config.facing
      actor.seatTransition = undefined; this.active.delete(actor.id)
    }
    const block = () => {
      t.waiting = true; state.blockedMs += dt
      if (!recovering && state.blockedMs > 8000) throw new SceneFault('SEAT_BLOCKED', '家具入口格被持续占用')
    }
    if (!t.reserved) {
      if (!this.passageClear(world, actor.id, port)) { block(); return }
      t.reserved = true
    }
    if (t.stage === 'entering' || t.stage === 'exiting') {
      const target = actor.step?.to ?? state.vertices[state.index]
      if (target) {
        const result = advanceCell(world, actor, target, dt, this.navigation, { contact: { propId: port.propId, interactionId: port.interactionId } }, this.stepDuration(actor.position, target, t))
        if (result === 'blocked') { block(); return }
        actor.posture = 'standing'; t.seatedAmount = 0; t.target = target
        const fraction = actor.step ? actor.step.elapsedMs / actor.step.durationMs : 1
        t.progress = (state.index - 1 + fraction) / Math.max(1, state.vertices.length - 1)
        if (result === 'arrived') state.index++
      }
      if (state.index >= state.vertices.length) {
        if (t.stage === 'entering' && port.config.posture === 'seated') { t.stage = 'sitting'; t.progress = 0; actor.facing = port.config.facing }
        else finish(t.stage === 'entering')
      }
    } else {
      t.progress = Math.min(1, t.progress + dt / (t.stage === 'aligning' ? 120 : POSTURE_MS))
      t.seatedAmount = t.stage === 'rising' ? 1 - t.progress : t.stage === 'sitting' ? t.progress : 0
      if (t.progress === 1) {
        if (t.stage === 'sitting') finish(true)
        else {
          t.stage = state.direction === 'exit' ? 'exiting' : 'entering'
          t.progress = 0; t.target = state.vertices[1]; actor.posture = 'standing'
        }
      }
    }
    if (actor.seatTransition) actor.seatTransition.waiting = false
    state.blockedMs = 0
  }
}
