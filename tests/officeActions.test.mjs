import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'

async function setup(t, mode = 'queue') {
  t.mock.method(console, 'info', () => {})
  const server = await createTestServer(mode)
  t.after(() => server.close())
  const load = path => server.ssrLoadModule(`/example/office-web/src/${path}.ts`)
  const dispatcher = await load('services/officeActionDispatcher')
  const bridge = await load('scene/officeSceneBridge')
  const store = await load('store/officeStore')
  const { INITIAL_AGENTS } = await load('scene/layout/officeLayout')
  const { startDeskVisit, startDeskVisitTour } = await load('scene/simulation/deskVisit')
  const executed = []
  const scene = {
    requestDeskVisit(visitor, host, message) {
      executed.push(message)
      store.setOfficeAgents(startDeskVisit(store.getOfficeAgents(), visitor, host, message))
    },
    requestDeskVisitTour(visitor, hosts, messageFn) {
      store.setOfficeAgents(startDeskVisitTour(store.getOfficeAgents(), visitor, hosts, messageFn))
    },
    setAgentState(id, state, task) { executed.push({ id, state, task }) },
  }
  const notify = () => dispatcher.notifyVisitMissionActivity(store.getOfficeAgents())
  const finish = () => {
    notify()
    store.setOfficeAgents(structuredClone(INITIAL_AGENTS))
    notify()
  }
  return { load, dispatcher, bridge, store, scene, executed, notify, finish }
}

const command = message => ({ type: 'desk_visit', visitor: 1, host: 2, message })

for (const mode of ['queue', 'skip', 'hybrid']) {
  test(`${mode}: startup visits stay in FIFO order without taking the execution lock`, async t => {
    const { dispatcher, bridge, scene, executed, notify, finish } = await setup(t, mode)
    dispatcher.submitVisitAction(command('A'))
    dispatcher.submitVisitAction(command('B'))
    assert.equal(dispatcher.getDispatchStats().executing, false)
    assert.equal(dispatcher.getDispatchStats().queueDepth, 2)
    notify()
    assert.deepEqual(executed, [])
    bridge.bindOfficeScene(scene)
    notify()
    assert.deepEqual(executed, ['A'])
    finish()
    assert.deepEqual(executed, ['A', 'B'])
    finish()
    assert.equal(dispatcher.getDispatchStats().queueDepth, 0)
    assert.equal(dispatcher.getDispatchStats().executing, false)
    assert.equal(dispatcher.getDispatchStats().skippedCount, 0)
    assert.equal(dispatcher.getDispatchStats().completedCount, 2)
  })

  test(`${mode}: manual interaction waits for a busy colleague`, async t => {
    const { dispatcher, bridge, scene, executed, notify, finish } = await setup(t, mode)
    bridge.bindOfficeScene(scene)
    dispatcher.submitVisitAction({ type: 'desk_visit', visitor: 2, host: 6, message: 'busy' })
    notify()
    dispatcher.submitVisitAction(command('manual'), { queueIfBusy: true })
    assert.deepEqual(executed, ['busy'])
    assert.equal(dispatcher.getDispatchStats().queueDepth, 1)
    finish()
    assert.deepEqual(executed, ['busy', 'manual'])
  })

  test(`${mode}: running visits retain the configured busy policy`, async t => {
    const { dispatcher, bridge, scene, executed, finish } = await setup(t, mode)
    bridge.bindOfficeScene(scene)
    dispatcher.submitVisitAction(command('A'))
    dispatcher.submitVisitAction(command('B'))
    assert.deepEqual(executed, ['A'])
    finish()
    assert.deepEqual(executed, mode === 'queue' ? ['A', 'B'] : ['A'])
    assert.equal(dispatcher.getDispatchStats().skippedCount, mode === 'queue' ? 0 : 1)
  })
}

test('startup tours preserve custom messages and queued states survive loading', async t => {
  const { dispatcher, bridge, scene, store, executed, notify } = await setup(t)
  bridge.setAgentState('marvis', 'thinking', 'plan')
  dispatcher.submitVisitAction(
    { type: 'desk_visit_tour', visitor: 1, hosts: [2, 3] },
    { messageFn: n => `visit ${n}` },
  )
  bridge.bindOfficeScene(scene)
  assert.deepEqual(executed, [{ id: 'marvis', state: 'thinking', task: 'plan' }])
  notify()
  const mission = store.getOfficeAgents()[0].mission
  assert.equal(mission.message, 'visit 2')
  assert.equal(mission.queue[0].message, 'visit 3')
})

test('invalid actions cannot take the dispatch lock', async t => {
  const { dispatcher, bridge, scene, executed } = await setup(t)
  const warnings = t.mock.method(console, 'warn', () => {})
  bridge.bindOfficeScene(scene)
  for (const invalid of [null, {}, { ...command('bad'), visitor: 1.5 }, { type: 'desk_visit_tour', visitor: 1, hosts: null }]) {
    dispatcher.submitVisitAction(invalid)
  }
  assert.equal(dispatcher.getDispatchStats().invalidCount, 4)
  assert.equal(warnings.mock.callCount(), 4)
  assert.equal(dispatcher.getDispatchStats().executing, false)
  dispatcher.submitVisitAction(command('valid'))
  assert.deepEqual(executed, ['valid'])
})

test('bad records and a failing action do not discard valid records in the same HTTP batch', async t => {
  const { load, bridge, scene, executed } = await setup(t)
  const warnings = t.mock.method(console, 'warn', () => {})
  bridge.bindOfficeScene({
    ...scene,
    setAgentState(id, state, task) {
      if (task === 'throw') throw new Error('test failure')
      scene.setAgentState(id, state, task)
    },
  })
  const { OfficeActionHttpClient } = await load('services/officeActionHttp')
  const client = new OfficeActionHttpClient()
  t.after(() => client.disconnect())
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ actions: [
    null,
    { type: 'desk_visit_tour', visitor: 1, hosts: null },
    { type: 'set_state', rosterNo: 1, state: 'invalid' },
    { type: 'set_state', rosterNo: 1, state: 'working', task: 'throw' },
    { type: 'set_state', rosterNo: 1, state: 'idle', task: 'valid' },
  ] }) }))
  client.shouldPoll = true
  await client.poll('/actions')
  assert.deepEqual(executed, [{ id: 'marvis', state: 'idle', task: 'valid' }])
  assert.equal(warnings.mock.callCount(), 4)
})

test('null poll responses are treated as empty batches', async t => {
  const { load } = await setup(t)
  const { OfficeActionHttpClient } = await load('services/officeActionHttp')
  const client = new OfficeActionHttpClient()
  t.after(() => client.disconnect())
  const warnings = t.mock.method(console, 'warn', () => {})
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => null }))
  client.shouldPoll = true
  await client.poll('/actions')
  assert.equal(warnings.mock.callCount(), 0)
})

test('destroying an old scene cannot unbind a newer scene', async t => {
  const { bridge, scene, executed } = await setup(t)
  const oldScene = { ...scene }
  bridge.bindOfficeScene(oldScene)
  bridge.bindOfficeScene(scene)
  bridge.unbindOfficeScene(oldScene)
  bridge.setAgentState('marvis', 'idle')
  assert.equal(executed.length, 1)
  bridge.unbindOfficeScene(scene)
  assert.equal(bridge.isOfficeSceneReady(), false)
})

test('action validation retains valid messages and filters invalid tour stops', async t => {
  const { load } = await setup(t)
  const { normalizeOfficeAction } = await load('services/officeActionValidation')
  assert.deepEqual(normalizeOfficeAction(command('hello')), command('hello'))
  assert.deepEqual(normalizeOfficeAction({ type: 'desk_visit_tour', visitor: 1, hosts: [1, 2, null, 2.5, 7, 6] }), {
    type: 'desk_visit_tour', visitor: 1, hosts: [2, 6], message: undefined,
  })
  assert.deepEqual(normalizeOfficeAction({ type: 'set_state', agentId: 'marvis', state: 'thinking', task: 'plan' }), {
    type: 'set_state', agentId: 'marvis', state: 'thinking', task: 'plan', rosterNo: undefined,
  })
})

test('action validation rejects malformed payloads without throwing', async t => {
  const { load } = await setup(t)
  const { normalizeOfficeAction } = await load('services/officeActionValidation')
  for (const payload of [
    null, undefined, [], 'hello', 1, {}, { type: 'unknown' },
    { ...command('bad'), visitor: '1' },
    { ...command('bad'), host: 1 },
    { ...command('bad'), host: 7 },
    { ...command('bad'), message: {} },
    { type: 'desk_visit_tour', visitor: 1, hosts: {} },
    { type: 'desk_visit_tour', visitor: 1, hosts: [] },
    { type: 'set_state', state: 'idle' },
    { type: 'set_state', agentId: ' ', state: 'idle' },
    { type: 'set_state', rosterNo: 1.5, state: 'idle' },
    { type: 'set_state', rosterNo: 1, state: 'idle', task: {} },
  ]) assert.equal(normalizeOfficeAction(payload), null)
})

test('disconnecting before the response is decoded does not dispatch stale actions', async t => {
  const { load, bridge, scene, executed } = await setup(t)
  bridge.bindOfficeScene(scene)
  const { OfficeActionHttpClient } = await load('services/officeActionHttp')
  const client = new OfficeActionHttpClient()
  t.after(() => client.disconnect())
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => {
    client.disconnect()
    return [{ type: 'set_state', rosterNo: 1, state: 'idle' }]
  } }))
  client.shouldPoll = true
  await client.poll('/actions')
  assert.deepEqual(executed, [])
  assert.equal(client.timer, null)
})
