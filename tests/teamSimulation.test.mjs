import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'

let server, OfficeSimulation, advanceOfficeSimulations, OfficeDemoSource, OfficeScene, createOfficeRuntime, SceneFault
before(async () => {
  server = await createTestServer()
  ;({ OfficeSimulation, advanceOfficeSimulations } = await server.ssrLoadModule('/example/office-web/src/application/OfficeSimulation.ts'))
  ;({ OfficeDemoSource } = await server.ssrLoadModule('/example/office-web/src/dashboard/OfficeDemoSource.ts'))
  ;({ OfficeScene } = await server.ssrLoadModule('/example/office-web/src/application/OfficeScene.ts'))
  ;({ createOfficeRuntime } = await server.ssrLoadModule('/example/office-web/src/application/createOfficeRuntime.ts'))
  ;({ SceneFault } = await server.ssrLoadModule('/packages/protocol/src/index.ts'))
})
after(() => server?.close())

test('hidden teams keep advancing and reopening a view reads live state without restarting demo', t => {
  let now = 0
  const runtimes = ['team-a', 'team-b'].map(sceneId => createOfficeRuntime({ sceneId, now: () => now }))
  const simulations = runtimes.map(runtime => new OfficeSimulation(runtime, new OfficeDemoSource(runtime)))
  const firstView = new OfficeScene({ simulation: simulations[0] })
  const secondView = new OfficeScene({ simulation: simulations[1] })
  t.after(() => { firstView.destroy(); secondView.destroy(); runtimes.forEach(runtime => runtime.dispose()) })
  firstView.setDemo(true); secondView.setDemo(true)
  const tick = () => { now += 50; advanceOfficeSimulations(simulations.values(), 50); simulations.forEach(simulation => simulation.demoSource.tick(50)) }
  tick()
  const commands = runtimes.map(runtime => runtime.snapshot().records.map(record => record.command.commandId))
  assert.deepEqual(commands.map(items => items.length), [3, 3])
  const before = runtimes[0].readWorld()
  firstView.destroy()
  for (let i = 0; i < 1200; i++) {
    tick()
    if (commands.every((ids, index) => ids.every(id => runtimes[index].getRecord(id).status === 'completed'))) break
  }
  for (const [index, ids] of commands.entries()) {
    assert(ids.every(id => runtimes[index].getRecord(id).status === 'completed'))
    assert.equal(simulations[index].isDemoRunning, true)
  }
  assert.notDeepEqual(runtimes[0].readWorld(), before)
  const live = runtimes[0].snapshot()
  const reopened = new OfficeScene({ simulation: simulations[0] })
  t.after(() => reopened.destroy())
  assert.equal(reopened.isDemoRunning, true)
  assert.deepEqual(reopened.runtime.snapshot(), live)
  for (let i = 0; i < 20; i++) reopened.onTick({ deltaTime: 3 })
  assert.deepEqual(reopened.runtime.snapshot(), live, 'render ticks must not double-advance a host-driven simulation')
  tick()
  assert.equal(simulations[0].isDemoRunning, true)
})

test('a hidden demo failure stops only that team and is retained for its next view', t => {
  const runtimes = ['team-a', 'team-b'].map(sceneId => createOfficeRuntime({ sceneId }))
  const simulations = runtimes.map(runtime => new OfficeSimulation(runtime, new OfficeDemoSource(runtime)))
  t.after(() => runtimes.forEach(runtime => runtime.dispose()))
  runtimes[0].setPluginEnabled('office.visits', false)
  simulations.forEach(simulation => simulation.setDemo(true))
  advanceOfficeSimulations(simulations, 50)
  simulations.forEach(simulation => simulation.demoSource.tick(50))
  assert.equal(simulations[0].isDemoRunning, false)
  assert(simulations[0].error)
  assert.equal(simulations[1].isDemoRunning, true)
  assert.equal(runtimes[1].snapshot().records.length, 3)
  const reopened = new OfficeScene({ simulation: simulations[0] })
  t.after(() => reopened.destroy())
  assert.equal(reopened.isDemoRunning, false)
  assert(simulations[0].error)
})

test('the shared clock advances every team in bounded small steps', () => {
  const calls = [[], []]
  const simulations = calls.map(list => ({ tick: elapsed => list.push(elapsed) }))
  advanceOfficeSimulations(simulations.values(), 125)
  assert.deepEqual(calls, [[50, 50, 25], [50, 50, 25]])
  for (const elapsed of [NaN, Infinity, -1]) advanceOfficeSimulations(simulations, elapsed)
  assert.equal(calls[0].length, 3)
  advanceOfficeSimulations(simulations, 60_000)
  assert.equal(calls[0].length, 23)
  assert.equal(calls[1].length, 23)
})

test('a movement failure keeps its reason code in the notice delivered to the office view', t => {
  const runtime = createOfficeRuntime()
  runtime.navigation.path = () => { throw new SceneFault('NO_ROUTE', '测试入口阻挡', { reasonCode: 'PATH_DISCONNECTED' }) }
  const simulation = new OfficeSimulation(runtime, new OfficeDemoSource(runtime)), notices = []
  const view = new OfficeScene({ simulation, onDraftChange: message => notices.push(message) })
  t.after(() => { view.destroy(); runtime.dispose() })
  view.setDemo(true)
  simulation.demoSource.tick(50)
  advanceOfficeSimulations([simulation], 50)
  simulation.demoSource.tick(50)
  assert.equal(simulation.isDemoRunning, false)
  assert.match(simulation.error, /\[[^\]]*DEPARTURE_ENTRY_UNAVAILABLE/)
  assert.equal(notices.at(-1), simulation.error)
  assert(runtime.snapshot().records.some(record => record.error?.details?.failures.some(failure => failure.reasonCode === 'DEPARTURE_ENTRY_UNAVAILABLE')))
})
