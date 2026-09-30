import assert from 'node:assert/strict'

export const base = commandId => ({ protocolVersion: '2.0', sceneId: 'office-1', commandId })
export const visit = (id = 'visit', actor = 'marvis', host = 'code-agent') => ({ ...base(id), type: 'activity.start', capability: 'office.visit', participants: [{ entityId: actor, role: 'visitor' }, { entityId: host, role: 'host' }], params: { stops: [{ hostId: host, message: 'hello' }], durationMs: 300 } })
export const move = (id, targetId, anchor, actor = 'marvis') => ({ ...base(id), type: 'activity.start', capability: 'scene.move', participants: [{ entityId: actor, role: 'actor' }], params: { targetId, anchor } })
export const use = (id, objectId = 'whiteboard-1', actor = 'marvis', interactionId = 'write') => ({ ...base(id), type: 'activity.start', capability: 'furniture.use', participants: [{ entityId: actor, role: 'user' }], params: { objectId, interactionId, durationMs: 300 } })
export const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
const key = p => `${p.x},${p.y}`

export function safeTick(runtime, dt = 50, advance = () => runtime.tick(dt)) {
  const before = runtime.readActors()
  advance()
  const world = runtime.readWorld(), claimed = new Map()
  for (const [i, actor] of world.actors.entries()) {
    const previous = before[i]
    assert(Number.isInteger(actor.position.x) && Number.isInteger(actor.position.y))
    assert(distance(previous.position, actor.position) <= 1, `${actor.id} skipped a cell`)
    const interaction = actor.seatTransition ?? previous.seatTransition ?? actor.using ?? previous.using
    const contact = interaction ? { propId: interaction.propId, interactionId: interaction.interactionId ?? 'seat' } : undefined
    assert(runtime.navigation.segmentClear(world, previous.position, actor.position, { contact }), `${actor.id} crossed furniture`)
    if (actor.step) {
      assert.equal(distance(actor.step.from, actor.step.to), 1)
      assert.deepEqual(actor.step.from, actor.position)
      assert(actor.step.elapsedMs >= 0 && actor.step.elapsedMs < actor.step.durationMs)
    }
    const cells = [actor.position, ...(actor.step ? [actor.step.to] : []), ...(actor.seatTransition?.reserved ? actor.seatTransition.passage : [])]
    for (const p of cells) {
      assert(Number.isInteger(p.x) && Number.isInteger(p.y))
      assert(!claimed.has(key(p)) || claimed.get(key(p)) === actor.id, `cell ${key(p)} double reserved by ${actor.id}/${claimed.get(key(p))}`)
      claimed.set(key(p), actor.id)
    }
    if (actor.seatTransition) assert.equal(actor.seatTransition.chairOffset, undefined)
  }
}
export function until(runtime, predicate, message = 'condition did not complete', ticks = 2400) {
  for (let i = 0; i < ticks; i++) { if (predicate()) return; safeTick(runtime) }
  assert.fail(`${message}: ${JSON.stringify(runtime.snapshot().records)}`)
}
export function completed(runtime, id) {
  until(runtime, () => !['queued', 'running'].includes(runtime.getRecord(id).status))
  assert.equal(runtime.getRecord(id).status, 'completed', JSON.stringify(runtime.getRecord(id)))
}
export function noClaims(runtime) { assert(runtime.snapshot().resources.every(r => !r.holders.length)) }
