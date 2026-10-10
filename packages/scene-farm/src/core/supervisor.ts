import type { SceneRuntime } from '@pixoffice/runtime'
import { cropStatus } from './crops.ts'
import { farmRoster } from './world.ts'

/** Optional local demo policy. External drivers can submit the same capabilities without it. */
export function tendFarm(runtime: SceneRuntime, now: number, createId: () => string) {
  const snapshot = runtime.snapshot()
  if (snapshot.persistenceError || snapshot.editing) return
  const pending = snapshot.records.filter(r => r.command.type === 'activity.start' && ['queued', 'running'].includes(r.status))
  const occupied = new Set(pending.flatMap(r => r.command.type === 'activity.start' && typeof r.command.params.plotId === 'string' ? [r.command.params.plotId] : []))
  const busyActors = new Set(pending.flatMap(r => r.command.type === 'activity.start' ? r.command.participants.map(p => p.entityId) : []))
  let storeBusy = snapshot.resources.some(r => r.resource === 'prop:harvest-store:inventory' && r.holders.length)
  for (const person of farmRoster) {
    const actor = snapshot.world.actors.find(a => a.id === person.id)
    if (!actor || busyActors.has(actor.id) || actor.step || actor.motion) continue
    const candidates = snapshot.world.props.filter(p => p.templateId === 'farm.plot' && !occupied.has(p.id)).map(plot => {
      const state = cropStatus(plot.state, now), operation = state.stage === 'ready' ? 'harvest' : state.stage === 'thirsty' ? 'water' : state.stage === 'empty' ? 'plant' : null
      const target = runtime.navigation.anchor(snapshot.world, plot.id, 'work')
      const blocked = snapshot.world.actors.some(a => a.id !== actor.id && (a.position.x === target.x && a.position.y === target.y || a.step?.to.x === target.x && a.step?.to.y === target.y))
      return { plot, operation, blocked, distance: Math.abs(target.x - actor.position.x) + Math.abs(target.y - actor.position.y) }
    }).filter(p => p.operation && !p.blocked && !(p.operation === 'harvest' && storeBusy))
      .sort((a, b) => Number(a.operation === 'plant') - Number(b.operation === 'plant') || a.distance - b.distance)
    const next = candidates[0]
    if (!next) continue
    const result = runtime.submit({ protocolVersion: '2.0', sceneId: runtime.sceneId, commandId: createId(), type: 'activity.start', capability: `farm.${next.operation}`,
      participants: [{ entityId: actor.id, role: 'farmer' }], params: { plotId: next.plot.id, ...(next.operation === 'plant' ? { crop: ['carrot', 'tomato', 'cabbage'][(Number(next.plot.id.split('-')[1]) - 1) % 3] } : {}) }, busyPolicy: 'reject' })
    if (['running', 'queued'].includes(result.status)) { occupied.add(next.plot.id); busyActors.add(actor.id); if (next.operation === 'harvest') storeBusy = true }
  }
}
