import type { Actor, Move, Point, Pose, World } from './model'
import type { NavigationAdapter, NavigationTemplates } from './navigationAdapter'
import { SceneFault } from './protocol'
import { SeatInteractions } from './seatInteraction'
import type { SeatPort, SeatStepDuration } from './seatInteraction'
import { advanceCell, occupiedCells } from './cellMovement'
import { sameCell } from './map/furnitureGrid'
import { resolvePoses, unrestrictedPoses } from './actionContract'
import type { PoseSupport } from './actionContract'

type ResolvedMove = { actor: Actor; path: Point[]; destination: Point; distance: number; departure?: SeatPort; arrival?: SeatPort; move?: Move; poses?: Pose[] }

export class MovementController {
  readonly seats: SeatInteractions
  private arrivals = new Map<string, SeatPort>()
  private goals = new Map<string, { move: Move; poses: Pose[] }>()
  private blocked = new Map<string, number>()
  private navigation: NavigationAdapter
  private supportsPose: PoseSupport
  constructor(navigation: NavigationAdapter, templates: NavigationTemplates = { template() { throw new SceneFault('TEMPLATE_NOT_FOUND', '缺少家具模板') } }, seatStepDuration?: SeatStepDuration, supportsPose: PoseSupport = unrestrictedPoses) {
    this.navigation = navigation
    this.supportsPose = supportsPose
    this.seats = new SeatInteractions(navigation, templates, seatStepDuration)
  }
  clear(actorId: string) { this.blocked.delete(actorId) }
  busy(actor: Actor) { return Boolean(actor.motion || actor.step || actor.seatTransition || this.arrivals.has(actor.id)) }
  start({ actor, path, departure, arrival, move, poses = [] }: ResolvedMove) {
    this.clear(actor.id)
    if (move) this.goals.set(actor.id, { move, poses })
    actor.motion = path.length ? { path, index: 0 } : undefined
    actor.expression = undefined
    if (arrival) this.arrivals.set(actor.id, arrival); else this.arrivals.delete(actor.id)
    if (departure) this.seats.begin(actor, departure, 'exit')
    else if (path.length) actor.posture = 'standing'
  }
  cancel(actor: Actor, rollback = false) {
    this.clear(actor.id); this.arrivals.delete(actor.id); this.goals.delete(actor.id); actor.motion = undefined
    if (rollback) this.seats.recover(actor)
  }
  needsRelease(actor: Actor) { return Boolean(actor.using && !(actor.using.propId === actor.homeId && actor.using.interactionId === 'seat')) }
  releaseUse(world: World, actor: Actor) {
    if (!actor.using || !this.needsRelease(actor) || this.busy(actor)) return
    const { propId, interactionId } = actor.using
    let port = this.seats.ports(world, propId, interactionId).find(p => !sameCell(p.approach, actor.position) && this.seats.passageClear(world, actor.id, p))
    if (!port && this.navigation.walkable(world, actor.position)) {
      const approach = [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: -1 }]
        .map(p => ({ x: actor.position.x + p.x, y: actor.position.y + p.y }))
        .find(p => this.navigation.walkable(world, p) && !occupiedCells(world, actor.id).some(c => sameCell(c, p)))
      if (approach) port = { propId, interactionId, seat: actor.position, approach, passage: [actor.position, approach], config: this.seats.config(world, propId, interactionId)! }
    }
    if (port) this.seats.begin(actor, port, 'exit')
  }
  stand(world: World, actor: Actor, reserved: Point[], toward?: Point) {
    const using = actor.using ?? (actor.homeId ? { propId: actor.homeId, interactionId: 'seat' } : undefined)
    if (!using) throw new SceneFault('MISSING_BINDING', '人物未使用家具')
    const config = this.seats.config(world, using.propId, using.interactionId)!
    const choices = config.approaches.flatMap(anchor => {
      try { return [this.resolve(world, { actorId: actor.id, targetId: using.propId, anchor }, new Set(), [...reserved])] } catch { return [] }
    })
    if (!choices.length) throw new SceneFault('NO_ROUTE', '家具的所有出口格都被挡住了')
    choices.sort((a, b) => a.distance + (toward ? Math.abs(a.destination.x - toward.x) + Math.abs(a.destination.y - toward.y) : 0) - b.distance - (toward ? Math.abs(b.destination.x - toward.x) + Math.abs(b.destination.y - toward.y) : 0))
    reserved.push(choices[0].destination); return choices[0]
  }
  private route(world: World, actor: Actor, from: Point, to: Point) {
    try { return this.navigation.path(world, from, to, { obstacles: this.seats.obstacles(world, actor.id) }) }
    catch { return this.navigation.path(world, from, to) }
  }
  resolve(world: World, move: Move, departing: Set<string>, reserved: Point[], requiredPoses: Pose[] = []): ResolvedMove {
    const actor = world.actors.find(a => a.id === move.actorId)
    if (!actor) throw new SceneFault('ENTITY_NOT_FOUND', move.actorId)
    const seat = this.seats.config(world, move.targetId)
    const interactionId = move.interactionId ?? (seat?.anchor === move.anchor ? 'seat' : undefined)
    const config = interactionId && this.seats.config(world, move.targetId, interactionId)
    if (interactionId && !config) throw new SceneFault('INTERACTION_NOT_SUPPORTED', interactionId)
    if (config && config.requiresHome && actor.homeId !== move.targetId) throw new SceneFault('SEAT_NOT_OWNED', '只能使用本人绑定的座位')
    if (config) resolvePoses(world, [{ actorId: actor.id, posture: config.posture, facing: config.facing }], this.supportsPose)
    const using = actor.using ?? (actor.posture === 'seated' && actor.homeId ? { propId: actor.homeId, interactionId: 'seat' } : undefined)
    let best: ResolvedMove | undefined
    let bestCost = Infinity
    const poses = requiredPoses.filter(pose => pose.actorId === actor.id || pose.lookAt === actor.id)
    let supported = false, poseError: SceneFault | undefined
    for (const anchor of new Set([move.anchor, ...move.alternatives ?? []])) {
      const destination = this.navigation.anchor(world, move.targetId, anchor)
      try {
        resolvePoses(world, poses, this.supportsPose, new Map([[actor.id, destination]]))
        supported = true
      } catch (error) {
        if (!(error instanceof SceneFault) || error.code !== 'UNSUPPORTED_POSE') throw error
        poseError = error; continue
      }
      if (reserved.some(p => sameCell(p, destination))) continue
      if (world.actors.some(a => a.id !== actor.id && !departing.has(a.id) && !a.motion && sameCell(a.position, destination))) continue
      if (sameCell(actor.position, destination) && (!interactionId || using?.propId === move.targetId && using.interactionId === interactionId)) {
        best = { actor, path: [], destination, distance: 0, move, poses }; break
      }
      const departures: (SeatPort | undefined)[] = using ? this.seats.ports(world, using.propId, using.interactionId) : [undefined]
      const arrivals: (SeatPort | undefined)[] = interactionId ? this.seats.ports(world, move.targetId, interactionId) : [undefined]
      for (const departure of departures) for (const arrival of arrivals) {
        if (departure && !this.seats.passageClear(world, actor.id, departure)) continue
        try {
          const path = this.route(world, actor, departure?.approach ?? actor.position, arrival?.approach ?? destination)
          const distance = path.length + (departure?.passage.length ?? 1) - 1 + (arrival?.passage.length ?? 1) - 1
          const occupied = occupiedCells(world, actor.id)
          const obstructed = path.some(p => occupied.some(c => sameCell(p, c))) || arrival && !this.seats.passageClear(world, actor.id, arrival)
          const cost = distance + (obstructed ? world.width * world.height : 0)
          if (cost < bestCost) { bestCost = cost; best = { actor, path, destination, distance, departure, arrival, move, poses } }
        } catch (error) { if (!(error instanceof SceneFault)) throw error }
      }
    }
    if (!best) throw !supported && poseError ? poseError : new SceneFault('NO_ROUTE', '没有空闲、可达的入口或目标格')
    reserved.push(best.destination)
    return best
  }
  private wait(world: World, actor: Actor, dt: number) {
    const elapsed = (this.blocked.get(actor.id) ?? 0) + dt
    this.blocked.set(actor.id, elapsed)
    if (actor.motion) actor.motion.waiting = true
    if (elapsed >= 12000) throw new SceneFault('TRAFFIC_BLOCKED', '通道持续被占用，请让出至少一格通路')
    if (Math.floor(elapsed / 400) === Math.floor((elapsed - dt) / 400)) return
    const nextCell = actor.motion?.path[actor.motion.index]
    const blocker = nextCell && world.actors.find(a => a.id !== actor.id && (sameCell(a.position, nextCell) || a.step && sameCell(a.step.to, nextCell)))
    // One actor holds course while the other detours, preventing mirrored sidesteps.
    if (blocker?.motion && world.actors.indexOf(actor) < world.actors.indexOf(blocker)) return
    const goal = this.goals.get(actor.id)
    if (!goal || actor.step) return
    try {
      const next = this.resolve(world, goal.move, new Set(), [], goal.poses)
      const target = next.path[0]
      if (target && occupiedCells(world, actor.id).some(p => sameCell(p, target))) return
      actor.motion = next.path.length ? { path: next.path, index: 0 } : undefined
      if (next.arrival) this.arrivals.set(actor.id, next.arrival)
    } catch { /* A transient occupant can leave; bounded waiting prevents an endless task. */ }
  }
  advance(world: World, actor: Actor, dt: number) {
    if (actor.seatTransition) { this.seats.advance(world, actor, dt); return }
    if (actor.step && !actor.motion) { advanceCell(world, actor, actor.step.to, dt, this.navigation); return }
    if (!actor.motion && this.arrivals.has(actor.id)) {
      const arrival = this.arrivals.get(actor.id)!
      if (!this.seats.passageClear(world, actor.id, arrival)) { this.wait(world, actor, dt); return }
      this.seats.begin(actor, arrival, 'enter'); this.arrivals.delete(actor.id); this.clear(actor.id); return
    }
    if (!actor.motion) { this.clear(actor.id); this.goals.delete(actor.id); return }
    const target = actor.step?.to ?? actor.motion.path[actor.motion.index]
    const result = advanceCell(world, actor, target, dt, this.navigation)
    if (result === 'blocked') { this.wait(world, actor, dt); return }
    this.clear(actor.id); actor.motion.waiting = false
    if (result === 'arrived') {
      actor.motion.index++
      if (actor.motion.index >= actor.motion.path.length) actor.motion = undefined
    }
  }
}
