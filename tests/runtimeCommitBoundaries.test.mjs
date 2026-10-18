import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { z } from 'zod'
import { createTestServer } from './helpers/vite.mjs'
import { beginMapEdit, editMapDraft } from './helpers/map.mjs'

let server, createSceneRuntime, createOfficeRuntime
before(async () => {
  server = await createTestServer()
  ;({ createSceneRuntime } = await server.ssrLoadModule('/packages/runtime/src/createSceneRuntime.ts'))
  ;({ createOfficeRuntime } = await server.ssrLoadModule('/example/office-web/src/application/createOfficeRuntime.ts'))
})
after(() => server?.close())

function pack(count = 1) {
  return { manifest: { id: 'test.boundaries', version: '1.0.0', apiVersion: 1 },
    createWorld: () => ({ sceneId: 'test', unit: 'cell', width: 12, height: 12, gridSize: 1, layoutRevision: 0,
      bounds: { left: 0, top: 0, right: 12, bottom: 12 }, props: [],
      actors: Array.from({ length: count }, (_, i) => ({ id: `actor-${i}`, name: `Actor ${i}`, templateId: 'person', color: 0,
        position: { x: i % 10 + 1, y: Math.floor(i / 10) + 1 }, facing: 'front', posture: 'standing', presentation: { status: 'idle', title: '', sourceRevision: 0 } })) }),
    plugins: [{ id: 'test.behaviors', name: 'Test', version: '1.0.0', apiVersion: 1, capabilities: [
      { id: 'test.say', name: 'Say', params: z.strictObject({}), build({ participants }) {
        const actorId = participants[0].entityId
        return { title: 'Say', claims: [{ resource: `actor:${actorId}:speech`, units: 1 }], phases: [
          { title: 'first', durationMs: 100, speech: [{ actorId, text: 'first' }] },
          { title: 'second', durationMs: 500, speech: [{ actorId, text: 'second' }] },
        ] }
      } },
      { id: 'test.hold', name: 'Hold', params: z.strictObject({ channel: z.enum(['body', 'speech']) }), build({ participants }, { channel }) {
        return { title: 'Hold', continuous: true, claims: [{ resource: `actor:${participants[0].entityId}:${channel}`, units: 1 }], phases: [{ title: 'Hold' }] }
      } },
    ] }],
  }
}
const command = (runtime, id, capability = 'test.say', actor = 'actor-0', params = {}) => ({ protocolVersion: '2.0', sceneId: runtime.sceneId,
  commandId: id, type: 'activity.start', capability, participants: [{ entityId: actor, role: 'actor' }], params })

test('disposing in a running notification prevents any subsequent phase side effects', t => {
  const runtime = createSceneRuntime(pack()); t.after(() => runtime.dispose())
  runtime.subscribe(() => {
    const event = runtime.snapshot().events.at(-1)
    if (event.type === 'command.status' && event.data.commandId === 'say' && event.data.status === 'running') runtime.dispose()
  })
  assert.equal(runtime.submit(command(runtime, 'say')).status, 'cancelled')
  assert.equal(runtime.readActors()[0].speech, undefined)
  assert(runtime.snapshot().resources.every(resource => !resource.holders.length))
})

test('stopping from a phase notification cannot resurrect speech after the activity has ended', t => {
  const runtime = createSceneRuntime(pack()); t.after(() => runtime.dispose())
  let stopped = false
  runtime.subscribe(() => {
    const event = runtime.snapshot().events.at(-1)
    if (!stopped && event.type === 'activity.phase' && event.data.title === 'second') {
      stopped = true
      assert.equal(runtime.submit({ protocolVersion: '2.0', sceneId: runtime.sceneId, commandId: 'stop', type: 'activity.stop', activityId: 'say' }).status, 'completed')
    }
  })
  runtime.submit(command(runtime, 'say')); runtime.tick(100); runtime.tick(0)
  assert.equal(stopped, true)
  assert.equal(runtime.getRecord('say').status, 'cancelled')
  assert.equal(runtime.readActors()[0].speech, undefined)
})

test('a committed map is already completed when its change notification closes the runtime', t => {
  const runtime = createOfficeRuntime(); t.after(() => runtime.dispose())
  beginMapEdit(runtime, 'begin')
  runtime.subscribe(() => {
    if (runtime.snapshot().events.at(-1).type === 'layout.changed') runtime.dispose()
  })
  const revision = runtime.readWorld().layoutRevision
  const result = editMapDraft(runtime, 'commit', { action: 'commit' })
  assert.equal(runtime.readWorld().layoutRevision, revision + 1)
  assert.equal(result.status, 'completed')
  assert.equal(runtime.getRecord('commit').status, 'completed')
})

test('all legal concurrent activities fit the checkpoint restore format', t => {
  const definition = pack(65), runtime = createSceneRuntime(definition); t.after(() => runtime.dispose())
  for (let i = 0; i < 65; i++) for (const channel of ['body', 'speech']) {
    assert.equal(runtime.submit(command(runtime, `hold-${i}-${channel}`, 'test.hold', `actor-${i}`, { channel })).status, 'completed')
  }
  const checkpoint = runtime.checkpoint()
  assert.equal(checkpoint.activeActivities.length, 130)
  let writes = 0
  const restored = createSceneRuntime(definition, { persistence: { load: () => checkpoint, save: () => { writes++ } } }); t.after(() => restored.dispose())
  assert.equal(restored.snapshot().persistenceError, undefined)
  assert.equal(restored.snapshot().records.length, 130)
  assert.equal(restored.snapshot().activities.length, 0, 'interrupted animations must not replay')
  assert.equal(writes, 0)
})

test('inconsistent checkpoint command identities are rejected without overwriting the original', t => {
  const runtime = createSceneRuntime(pack()); t.after(() => runtime.dispose())
  runtime.submit(command(runtime, 'hold', 'test.hold', 'actor-0', { channel: 'body' }))
  const valid = runtime.checkpoint()
  for (const corrupt of [
    saved => saved.records.push(structuredClone(saved.records[0])),
    saved => { saved.records[0].command.sceneId = 'other' },
    saved => saved.activeActivities.push(structuredClone(saved.activeActivities[0])),
    saved => { saved.activeActivities[0].commandId = 'missing' },
    saved => { saved.records[0].activityId = 'other' },
    saved => { saved.activeActivities[0].capability = 'other' },
  ]) {
    const saved = structuredClone(valid); corrupt(saved)
    const original = structuredClone(saved); let writes = 0
    const restored = createSceneRuntime(pack(), { persistence: { load: () => saved, save: () => { writes++ } } }); t.after(() => restored.dispose())
    assert(restored.snapshot().persistenceError)
    assert.equal(restored.snapshot().records.length, 0)
    assert.equal(writes, 0)
    assert.deepEqual(saved, original)
  }
})
