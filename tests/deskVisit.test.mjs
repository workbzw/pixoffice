import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'
import { base, visit, completed, noClaims } from './helpers/grid.mjs'
let server, createOfficeRuntime
before(async () => {
  server = await createTestServer()
  ;({ createOfficeRuntime } = await server.ssrLoadModule('/example/office-web/src/application/createOfficeRuntime.ts'))
})
after(() => server?.close())

test('frequent business status updates never restart a visit or its return route', t => {
  const runtime = createOfficeRuntime()
  t.after(() => runtime.dispose())
  runtime.submit(visit('handoff'))
  let revision = 0, walking = false
  for (let i = 0; i < 2000 && runtime.getRecord('handoff').status === 'running'; i++) {
    if (i % 20 === 0) runtime.submit({ ...base('status-' + i), type: 'actor.presentation.set', actorId: 'office-lead',
      sourceRevision: ++revision, status: 'working', title: 'Latest task' })
    runtime.tick(50)
    walking ||= Boolean(runtime.readActors()[0].motion || runtime.readActors()[0].step)
  }
  assert(walking); assert.equal(runtime.getRecord('handoff').status, 'completed')
  const actor = runtime.readActors()[0]
  assert.equal(actor.posture, 'seated'); assert.equal(actor.using.propId, actor.homeId)
  assert.equal(actor.presentation.title, 'Latest task'); noClaims(runtime)
})

test('an uninterrupted visit and reply return both people to their own seated poses', t => {
  const runtime = createOfficeRuntime()
  t.after(() => runtime.dispose())
  runtime.submit(visit('normal')); completed(runtime, 'normal'); noClaims(runtime)
  for (const actor of runtime.readActors().slice(0, 2)) {
    assert.equal(actor.posture, 'seated'); assert.equal(actor.using.propId, actor.homeId)
    assert.equal(actor.speech, undefined)
  }
})
