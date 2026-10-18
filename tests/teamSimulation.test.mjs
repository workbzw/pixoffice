import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'
import { safeTick, noClaims } from './helpers/grid.mjs'

let server, OfficeSimulation, advanceOfficeSimulations, OfficeDemoSource, OfficeScene, createOfficeRuntime, SceneFault, seatStepDurationMs
before(async () => {
  server = await createTestServer()
  ;({ OfficeSimulation, advanceOfficeSimulations } = await server.ssrLoadModule('/example/office-web/src/application/OfficeSimulation.ts'))
  ;({ OfficeDemoSource } = await server.ssrLoadModule('/example/office-web/src/dashboard/OfficeDemoSource.ts'))
  ;({ OfficeScene } = await server.ssrLoadModule('/example/office-web/src/application/OfficeScene.ts'))
  ;({ createOfficeRuntime } = await server.ssrLoadModule('/example/office-web/src/application/createOfficeRuntime.ts'))
  ;({ SceneFault } = await server.ssrLoadModule('/packages/protocol/src/index.ts'))
  ;({ seatStepDurationMs } = await server.ssrLoadModule('/packages/scene-office/src/pixi/projection.ts'))
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

test('reference office completes repeated parallel demo rounds across browser suspensions without collisions', t => {
  let now = 0, seed = 12345, suspensions = 0, lastSuspendedBatch = -1
  const runtime = createOfficeRuntime({ referenceLayout: true, now: () => now, seatStepDuration: seatStepDurationMs })
  const demo = new OfficeDemoSource(runtime)
  const simulation = { tick: dt => safeTick(runtime, dt) }
  t.after(() => runtime.dispose())
  demo.setEnabled(true)
  for (let frame = 0; frame < 16000; frame++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    let elapsed = 8 + seed % 93
    const snapshot = runtime.snapshot()
    if (snapshot.records.length !== lastSuspendedBatch && snapshot.world.actors.filter(actor => actor.speech).length === 3) {
      elapsed += 180000
      suspensions++
      lastSuspendedBatch = snapshot.records.length
    }
    now += elapsed
    advanceOfficeSimulations([simulation], elapsed)
    if (runtime.snapshot().records.length >= 60) demo.setEnabled(false)
    demo.tick(Math.min(elapsed, 1000))
    assert.equal(demo.error, null)
    const records = runtime.snapshot().records
    assert(records.every(record => !record.error), JSON.stringify(records.filter(record => record.error)))
    if (records.length >= 60 && records.every(record => record.status === 'completed')) break
  }
  assert.equal(runtime.completedActivityCount, 60, 'two full directed-pair cycles complete')
  assert(suspensions >= 10, 'the long run includes repeated suspension during conversations')
  assert(runtime.readActors().every(actor => actor.posture === 'seated' && actor.using?.propId === actor.homeId && !actor.motion && !actor.seatTransition))
  noClaims(runtime)
})

test('restarting demo first walks stranded visitors home before starting new visits', t => {
  let now = 0
  const runtime = createOfficeRuntime({ referenceLayout: true, now: () => now, seatStepDuration: seatStepDurationMs })
  const demo = new OfficeDemoSource(runtime)
  t.after(() => runtime.dispose())
  const tick = () => { now += 50; safeTick(runtime); demo.tick(50) }
  demo.setEnabled(true)
  for (let i = 0; i < 2000 && runtime.readActors().filter(actor => actor.speech).length !== 3; i++) tick()
  assert.equal(runtime.readActors().filter(actor => actor.speech).length, 3)
  demo.setEnabled(false)
  const visits = runtime.snapshot().records.map(record => record.command.commandId)
  for (const [index, targetCommandId] of visits.entries()) runtime.submit({ protocolVersion: '2.0', sceneId: runtime.sceneId, commandId: `interrupt-${index}`, type: 'command.cancel', targetCommandId })
  for (let i = 0; i < 20; i++) tick()
  assert.equal(runtime.readActors().filter(actor => actor.posture === 'standing').length, 3)
  const positions = runtime.readActors().map(actor => actor.position)
  demo.setEnabled(true)
  demo.tick(0)
  assert.deepEqual(runtime.readActors().map(actor => actor.position), positions, 'recovery must not teleport')
  const returns = runtime.snapshot().records.filter(record => record.command.capability === 'scene.move')
  assert.equal(returns.length, 3)
  for (let i = 0; i < 4000; i++) {
    tick()
    assert.equal(demo.error, null)
    const records = runtime.snapshot().records
    if (records.filter(record => record.command.capability === 'office.visit').length >= 6) demo.setEnabled(false)
    if (records.filter(record => record.command.capability === 'office.visit' && record.status === 'completed').length === 3) break
  }
  assert(returns.every(record => runtime.getRecord(record.command.commandId).status === 'completed'))
  assert.equal(runtime.snapshot().records.filter(record => record.command.capability === 'office.visit' && record.status === 'completed').length, 3)
  assert(runtime.readActors().every(actor => actor.posture === 'seated' && actor.using?.propId === actor.homeId))
  noClaims(runtime)
})
