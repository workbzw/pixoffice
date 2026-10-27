import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'
import { safeTick, noClaims } from './helpers/grid.mjs'

let server, createOfficeRuntime, OfficeSimulation, OfficeDemoSource, projectAgents, OfficeTeamSession, OfficeTeamHost, CommerceOfficeDataSource, createOfficePresentation
before(async () => {
  server = await createTestServer()
  ;({ createOfficeRuntime } = await server.ssrLoadModule('/example/office-web/src/application/createOfficeRuntime.ts'))
  ;({ OfficeSimulation } = await server.ssrLoadModule('/example/office-web/src/application/OfficeSimulation.ts'))
  ;({ OfficeDemoSource } = await server.ssrLoadModule('/example/office-web/src/dashboard/OfficeDemoSource.ts'))
  ;({ projectAgents } = await server.ssrLoadModule('@pixoffice/scene-office/adapters/office'))
  ;({ createOfficePresentation } = await server.ssrLoadModule('@pixoffice/scene-office/pixi'))
  ;({ OfficeTeamSession } = await server.ssrLoadModule('/example/office-web/src/application/OfficeTeamSession.ts'))
  ;({ OfficeTeamHost } = await server.ssrLoadModule('/example/office-web/src/application/OfficeTeamHost.ts'))
  ;({ CommerceOfficeDataSource } = await server.ssrLoadModule('/example/office-web/src/dashboard/CommerceOfficeDataSource.ts'))
})
after(async () => { await server?.close() })

function setup(t, referenceLayout = true) {
  let now = 0
  const runtime = createOfficeRuntime({ referenceLayout, now: () => now })
  const simulation = new OfficeSimulation(runtime, new OfficeDemoSource(runtime, { automatic: false }))
  t.after(() => runtime.dispose())
  const tick = () => { now += 50; safeTick(runtime, 50, () => simulation.tick(50)) }
  return { runtime, simulation, tick }
}

for (const reference of [true, false]) test(`all six complete every supported motion family safely (${reference ? 'reference' : 'grid'} office)`, t => {
  const { runtime, simulation, tick } = setup(t, reference)
  const coverage = new Map(runtime.readActors().map(actor => [actor.id, { walks: new Set(), emotes: new Set(), speech: new Set(), transitions: new Set(), leisure: new Set(), work: false }]))
  const presentation = createOfficePresentation()
  simulation.setDemoMode('actions'); simulation.setDemo(true)
  let frames = 0
  while (simulation.isDemoRunning && frames++ < 24000) {
    tick()
    const agents = new Map(projectAgents(runtime, false).map(agent => [agent.id, agent]))
    for (const actor of presentation.projectActors(runtime)) if (actor.intent.actionId === 'core.leisure') coverage.get(actor.id).leisure.add(`${actor.intent.poseId}.${actor.intent.view}`)
    for (const actor of runtime.readActors()) {
      const seen = coverage.get(actor.id)
      if (actor.step) seen.walks.add(actor.facing)
      if (actor.expression) seen.emotes.add(actor.expression)
      if (actor.speech) seen.speech.add(`${actor.posture}.${actor.facing}`)
      if (actor.seatTransition) seen.transitions.add(actor.seatTransition.stage)
      if (agents.get(actor.id).state === 'working') seen.work = true
    }
    assert.equal(simulation.error, null, `${simulation.demoStatus}: ${simulation.error}`)
  }
  assert.equal(simulation.isDemoRunning, false, `stuck at ${simulation.demoStatus}`)
  assert.match(simulation.demoStatus, /已完成/)
  for (const [id, seen] of coverage) {
    assert.deepEqual([...seen.walks].sort(), ['back', 'front', 'left', 'right'], id)
    assert.deepEqual([...seen.emotes].sort(), ['emotes/surprised', 'emotes/thinking', 'emotes/wave'], id)
    for (const pose of ['standing.front', 'standing.left', 'standing.right', 'seated.left', 'seated.right']) assert(seen.speech.has(pose), `${id}: no ${pose} speech (${[...seen.speech]})`)
    assert(seen.transitions.has('rising') && seen.transitions.has('sitting'), `${id}: missing sit/rise`)
    assert(seen.work, `${id}: missing work`)
    assert(seen.leisure.has('standing.front') && seen.leisure.has('seated.back'), `${id}: missing standing/seated leisure`)
  }
  assert(runtime.readActors().every(actor => actor.posture === 'seated' && actor.using?.propId === actor.homeId && !actor.motion && !actor.seatTransition))
  assert(runtime.snapshot().records.every(record => !record.error))
  noClaims(runtime)
  t.diagnostic(`full showcase: ${Math.round(frames * .05)} simulation seconds`)
})

test('stop cancels continuous work and a restart does not overlap the previous run', t => {
  const { runtime, simulation, tick } = setup(t)
  simulation.setDemoMode('actions'); simulation.setDemo(true)
  for (let i = 0; i < 100 && !runtime.readActivePhases().some(phase => phase.capability === 'office.focus'); i++) tick()
  assert(runtime.readActivePhases().some(phase => phase.capability === 'office.focus'))
  simulation.setDemo(false)
  for (let i = 0; i < 100; i++) tick()
  assert.equal(simulation.isDemoRunning, false)
  assert.equal(runtime.readActivePhases().length, 0)
  noClaims(runtime)
  simulation.setDemo(true)
  for (let i = 0; i < 300; i++) tick()
  assert.equal(simulation.error, null)
  assert.equal(simulation.isDemoRunning, true)
  simulation.setDemo(false)
  for (let i = 0; i < 2000 && runtime.readActivePhases().length; i++) tick()
  noClaims(runtime)
})

test('action showcase does not advance commerce or create approval dialogs', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 })
  const runtime = createOfficeRuntime({ referenceLayout: true })
  const source = new CommerceOfficeDataSource('operations'), session = new OfficeTeamSession(runtime, source, { decisionPreview: true })
  const host = new OfficeTeamHost()
  t.after(() => { host.stop(); runtime.dispose() })
  host.update([session]); await session.refresh()
  const before = await source.getSnapshot()
  session.simulation.setDemoMode('actions'); session.simulation.setDemo(true)
  for (let i = 0; i < 800; i++) { host.advance(50); t.mock.timers.tick(50) }
  assert.equal(source.stage, 'ready')
  assert.deepEqual(await source.getSnapshot(), before)
  assert.equal(session.decisions.getSnapshot().pending.length, 0)
  assert.equal(session.simulation.isScenarioRunning, false)
  session.simulation.setDemoMode('scenario')
  assert.equal(source.stage, 'dispatching')
  assert.equal(session.simulation.isScenarioRunning, true)
  session.simulation.setDemoMode('actions')
  assert.equal(source.stage, 'stopped')
  assert.equal(session.simulation.isScenarioRunning, false)
  session.simulation.setDemo(false)
})

test('starting an action showcase in another office stops the shared commerce story and vice versa', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 })
  const sessions = ['operations', 'visual'].map(team => new OfficeTeamSession(createOfficeRuntime({ referenceLayout: true, sceneId: team }), new CommerceOfficeDataSource(team), { decisionPreview: true }))
  const host = new OfficeTeamHost()
  t.after(() => { host.stop(); for (const session of sessions) session.runtime.dispose() })
  host.update(sessions); await Promise.all(sessions.map(session => session.refresh()))
  const [first, second] = sessions
  first.simulation.setDemo(true)
  for (let i = 0; i < 20; i++) host.advance(50)
  assert.equal(first.source.stage, 'dispatching')
  second.simulation.setDemoMode('actions'); second.simulation.setDemo(true)
  assert.equal(first.simulation.isDemoRunning, false)
  assert.equal(second.simulation.isDemoRunning, true)
  assert(sessions.every(session => session.source.stage === 'stopped'))
  for (let i = 0; i < 100; i++) host.advance(50)
  assert.equal(second.simulation.error, null)
  first.simulation.setDemo(true)
  assert.equal(second.simulation.isDemoRunning, false)
  assert.equal(first.source.stage, 'dispatching')
  first.simulation.setDemo(false)
})

test('interruption during seated dialogue releases the observer and returns everyone without teleporting', t => {
  const { runtime, simulation, tick } = setup(t)
  simulation.setDemoMode('actions'); simulation.setDemo(true)
  for (let i = 0; i < 10000 && !simulation.demoStatus.includes('右侧交谈'); i++) tick()
  assert.match(simulation.demoStatus, /右侧交谈/)
  simulation.setDemo(false)
  for (let i = 0; i < 2000 && (runtime.readActivePhases().length || runtime.readActors().some(actor => actor.motion || actor.seatTransition)); i++) tick()
  assert.equal(runtime.readActivePhases().length, 0)
  assert(runtime.readActors().every(actor => actor.posture === 'seated' && actor.using?.propId === actor.homeId))
  noClaims(runtime)
})
