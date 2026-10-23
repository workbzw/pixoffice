import { Container, Rectangle, Sprite, Texture } from 'pixi.js'
import type { PresentedActor } from '@pixoffice/contracts/presentation'
import type { World } from '@pixoffice/runtime/model'
import type { SceneReadPort } from '@pixoffice/runtime'
import type { SceneAmbientView } from '@pixoffice/renderer-pixi/ScenePresentationPack'
import { seatPixels } from '../projection.ts'

export function officeWorkEffectSeat(actor: PresentedActor | undefined, world: World) {
  const entity = actor && world.actors.find(candidate => candidate.id === actor.id)
  const desk = entity && world.props.find(prop => prop.id === entity.homeId && prop.templateId === 'office.reference-workstation')
  if (!actor || !entity || !desk || entity.motion || entity.step || entity.seatTransition || entity.speech || entity.expression
    || !actor.furniture?.seated || actor.furniture.transitioning || actor.intent.view !== 'back'
    || entity.position.x !== desk.position.x + 1 || entity.position.y !== desk.position.y + 2) return undefined
  return seatPixels(entity.position)
}

export function officeWorkEffectActive(actor: PresentedActor | undefined, world: World) {
  return actor?.status === 'working' && actor.task?.status === 'running' && Boolean(officeWorkEffectSeat(actor, world))
}

export class OfficeWorkEffectClock {
  time = 0
  opacity = 0
  completion = 0
  private runningTask = ''
  private completedTask = ''

  update(dt: number, active: boolean, taskKey: string, completed: boolean) {
    const elapsed = Math.max(0, Math.min(dt, .05))
    if (active) {
      if (this.runningTask !== taskKey) this.time = 0
      this.runningTask = taskKey
      this.completedTask = ''
      this.completion = 0
      this.time += elapsed
    } else if (completed && taskKey && this.runningTask === taskKey && this.completedTask !== taskKey) {
      this.completion = 1
      this.completedTask = taskKey
    }
    this.opacity = Math.max(0, Math.min(1, this.opacity + elapsed * (active ? 4 : -5)))
    this.completion = Math.max(0, this.completion - elapsed / 1.1)
    // Runtime and task projections can notify separately within the same frame.
    if (!active && !completed && elapsed > 0) this.runningTask = ''
  }
}

export const OFFICE_WORK_EFFECT = { columns: 3, rows: 2, cellPixels: 160, displayPixels: 160, opacity: 1,
  frameDurationsMs: [170, 170, 170, 170, 170, 200] } as const

export function officeWorkEffectFrame(seconds: number) {
  const total = OFFICE_WORK_EFFECT.frameDurationsMs.reduce((sum, duration) => sum + duration, 0)
  let elapsed = Math.max(0, seconds * 1000) % total
  for (const [index, duration] of OFFICE_WORK_EFFECT.frameDurationsMs.entries()) {
    if (elapsed < duration) return index
    elapsed -= duration
  }
  return 0
}

export function createOfficeWorkEffects(atlas: Texture, runtime: SceneReadPort, actorIds: readonly string[],
  projectActors: (world: World) => PresentedActor[], reducedMotion?: () => boolean): SceneAmbientView {
  const { columns, rows, cellPixels } = OFFICE_WORK_EFFECT
  if (atlas.width !== columns * cellPixels || atlas.height !== rows * cellPixels) throw new Error('Invalid office crafting atlas: expected 480 x 320')
  const frames = Array.from({ length: columns * rows }, (_, i) => new Texture({ source: atlas.source,
    frame: new Rectangle(i % columns * cellPixels, Math.floor(i / columns) * cellPixels, cellPixels, cellPixels) }))
  const media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')
  const reduceMotion = reducedMotion ?? (() => media?.matches ?? false)
  const cycle = OFFICE_WORK_EFFECT.frameDurationsMs.reduce((sum, duration) => sum + duration, 0) / 1000
  const workers = actorIds.map((actorId, index) => {
    const root = new Container(), sprite = new Sprite(frames[0])
    root.label = `office-work-effect:${actorId}`
    root.eventMode = 'none'
    root.visible = false
    sprite.label = 'office-crafting-frames'
    sprite.anchor.set(.5, .9)
    sprite.scale.set(OFFICE_WORK_EFFECT.displayPixels / cellPixels)
    root.addChild(sprite)
    return { actorId, root, sprite, clock: new OfficeWorkEffectClock(), phase: index * cycle / actorIds.length }
  })
  let disposed = false
  return { roots: workers.map(worker => worker.root),
    update(dt, world, projectedActors) {
      if (disposed || runtime.isEditing) { workers.forEach(worker => { worker.root.visible = false }); return }
      const actors = new Map((projectedActors ?? projectActors(world)).map(actor => [actor.id, actor]))
      const reduced = reduceMotion()
      for (const { actorId, root, sprite, clock, phase } of workers) {
        const actor = actors.get(actorId)
        const seat = officeWorkEffectSeat(actor, world)
        const active = officeWorkEffectActive(actor, world)
        const taskKey = actor?.task ? `${actor.task.id ?? ''}:${actor.task.title}` : ''
        clock.update(dt, active, taskKey, Boolean(seat && actor?.task?.status === 'completed'))
        root.visible = Boolean(seat) && (clock.opacity > .001 || clock.completion > 0)
        if (!root.visible || !seat) continue
        root.position.set(seat.x, seat.y - 32)
        root.zIndex = seat.y - .5
        const finishing = clock.completion > 0
        const frame = reduced ? 0 : finishing ? Math.min(5, 4 + Math.floor((1 - clock.completion) * 2)) : officeWorkEffectFrame(clock.time + phase)
        sprite.texture = frames[frame]
        sprite.alpha = (finishing ? Math.min(1, clock.completion * 2) : clock.opacity) * OFFICE_WORK_EFFECT.opacity
      }
    },
    dispose() {
      if (disposed) return
      disposed = true; workers.forEach(worker => { worker.root.visible = false })
      frames.forEach(frame => frame.destroy())
    },
  }
}
