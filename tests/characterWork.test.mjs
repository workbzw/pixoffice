import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'
import { frameVisualFixture } from './helpers/frameVisual.mjs'

let server, createOfficeRuntime, presentation
before(async () => {
  server = await createTestServer()
  ;({ createOfficeRuntime } = await server.ssrLoadModule('/example/office-web/src/application/createOfficeRuntime.ts'))
  const { createOfficePresentation } = await server.ssrLoadModule('/packages/scene-office/src/pixi/index.ts')
  presentation = createOfficePresentation()
})
after(() => server?.close())
const base = commandId => ({ protocolVersion: '2.0', sceneId: 'office-1', commandId })
const focus = id => ({ ...base('focus-' + id), type: 'activity.start', capability: 'office.focus',
  participants: [{ entityId: id, role: 'worker' }], params: { title: 'Work: ' + id } })

test('all six focus activities keep typing for a minute and restore external presentation', async t => {
  let now = 1000
  const runtime = createOfficeRuntime({ now: () => now })
  t.after(() => runtime.dispose())
  runtime.submit({ ...base('external'), type: 'actor.presentation.set', actorId: 'office-lead', status: 'thinking', title: 'External task', sourceRevision: 1 })
  const external = runtime.readActors().map(actor => actor.presentation), models = new Map(), activities = []
  for (const actor of runtime.readActors()) {
    const model = await frameVisualFixture(t, server, actor.id)
    model.seen = new Set(); models.set(actor.id, model)
    const started = runtime.submit(focus(actor.id))
    assert.equal(started.status, 'completed'); activities.push(started.activityId)
  }
  for (const actor of presentation.projectActors(runtime)) models.get(actor.id).present(actor, 0)
  for (let elapsed = 50; elapsed <= 60000; elapsed += 50) {
    now += 50; runtime.tick(50)
    for (const actor of presentation.projectActors(runtime)) {
      assert.equal(actor.intent.actionId, 'office.type')
      const model = models.get(actor.id), root = model.present(actor, .05)
      assert.equal(root.sprite.texture, model.texture('work.quiet-back', elapsed))
      assert.equal(root.children.length, 3, 'only shadow, body and mouth are mounted; no separate arm sprites')
      model.seen.add(root.sprite.texture)
    }
  }
  assert.deepEqual(runtime.readActors().map(actor => actor.presentation), external)
  for (const model of models.values()) assert.equal(model.seen.size, 4)
  for (const [index, activityId] of activities.entries()) runtime.submit({ ...base('stop-' + index), type: 'activity.stop', activityId })
  assert.equal(runtime.readActivePhases().length, 0)
  for (const actor of presentation.projectActors(runtime)) {
    const model = models.get(actor.id)
    assert.equal(model.present(actor, 0).sprite.texture, model.texture('sit.back'))
  }
})

test('focus starts typing after returning to the seat, never while walking or docking', t => {
  const runtime = createOfficeRuntime()
  t.after(() => runtime.dispose())
  runtime.submit({ ...base('leave'), type: 'activity.start', capability: 'scene.move', participants: [{ entityId: 'office-lead', role: 'actor' }], params: { targetId: 'whiteboard-1', anchor: 'attendee1' } })
  for (let i = 0; i < 1000 && runtime.getRecord('leave').status === 'running'; i++) runtime.tick(50)
  runtime.submit(focus('office-lead'))
  let walked = false, worked = false
  for (let i = 0; i < 1000; i++) {
    runtime.tick(50)
    const actor = runtime.readActors()[0], projected = presentation.projectActors(runtime)[0]
    if (actor.motion || actor.step || actor.seatTransition) {
      assert.notEqual(projected.intent.actionId, 'office.type'); walked ||= projected.intent.actionId === 'core.walk'
    } else if (projected.intent.actionId === 'office.type') {
      assert.equal(actor.posture, 'seated'); assert.equal(projected.intent.view, 'back'); worked = true; break
    }
  }
  assert(walked && worked)
})

test('remote working status loops complete typing frames without a focus activity', async t => {
  const runtime = createOfficeRuntime(), model = await frameVisualFixture(t, server)
  t.after(() => runtime.dispose())
  runtime.submit({ ...base('working'), type: 'actor.presentation.set', actorId: 'office-lead', status: 'working', title: 'Remote task', sourceRevision: 1 })
  assert.equal(runtime.readActivePhases().length, 0)
  model.present(presentation.projectActors(runtime)[0], 0)
  for (let i = 1; i <= 400; i++) {
    const root = model.present(presentation.projectActors(runtime)[0], .05)
    assert.equal(root.sprite.texture, model.texture('work.quiet-back', i * 50))
  }
  runtime.submit({ ...base('idle'), type: 'actor.presentation.set', actorId: 'office-lead', status: 'idle', title: 'Done', sourceRevision: 2 })
  assert.equal(model.present(presentation.projectActors(runtime)[0], 0).sprite.texture, model.texture('sit.back'))
})

test('reusing a render snapshot preserves active focus work instead of treating it as an editor preview', t => {
  const runtime = createOfficeRuntime(); t.after(() => runtime.dispose())
  runtime.submit(focus('office-lead')); runtime.tick(50)
  const projected = presentation.projectActors(runtime, runtime.readWorld())[0]
  assert.equal(projected.intent.actionId, 'office.type')
  assert.equal(projected.title, 'Work: office-lead')
  assert.equal(projected.status, 'working')
})
