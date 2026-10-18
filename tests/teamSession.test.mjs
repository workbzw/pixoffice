import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'

let server, OfficeTeamSession, OfficeTeamHost, advanceOfficeTeamSessions, ExampleOfficeDataSource, createOfficeRuntime, visitCommand, presentationCommand, createDecisionPreview, createTeamDirectoryStore
before(async () => {
  server = await createTestServer()
  ;({ OfficeTeamSession, advanceOfficeTeamSessions } = await server.ssrLoadModule('/example/office-web/src/application/OfficeTeamSession.ts'))
  ;({ OfficeTeamHost } = await server.ssrLoadModule('/example/office-web/src/application/OfficeTeamHost.ts'))
  ;({ ExampleOfficeDataSource } = await server.ssrLoadModule('/example/office-web/src/dashboard/demoSource.ts'))
  ;({ createOfficeRuntime } = await server.ssrLoadModule('/example/office-web/src/application/createOfficeRuntime.ts'))
  ;({ visitCommand, presentationCommand } = await server.ssrLoadModule('/packages/scene-office/src/adapters/office.ts'))
  ;({ createDecisionPreview } = await server.ssrLoadModule('/example/office-web/src/application/decisions/preview.ts'))
  ;({ createTeamDirectoryStore } = await server.ssrLoadModule('/example/office-web/src/controller/useOfficeTeamDirectory.ts'))
})
after(() => server?.close())

function remoteSource() {
  const source = new ExampleOfficeDataSource()
  return { kind: 'http', getSnapshot: () => source.getSnapshot(), subscribe: listener => source.subscribe(listener), execute: action => source.execute(action) }
}

function setup(t, id = 'team-a', source = remoteSource(), options = {}) {
  const runtime = createOfficeRuntime({ sceneId: id, ...options.runtime })
  const session = new OfficeTeamSession(runtime, source, options)
  t.after(() => { session.stop(); runtime.dispose() })
  session.start()
  return session
}

test('a hidden team consumes business updates without any view subscriber', async t => {
  const a = setup(t), b = setup(t, 'team-b')
  await Promise.all([a.refresh(), b.refresh()])
  const bBefore = b.getSnapshot().dashboard
  const unsubscribe = b.subscribe(() => {})
  t.after(unsubscribe)
  await a.source.execute({ type: 'task.complete', taskId: 'market-research' })
  await a.refresh()
  assert.equal(a.getSnapshot().dashboard.tasks.find(task => task.id === 'market-research').status, 'completed')
  assert.equal(a.runtime.readActors().find(actor => actor.id === 'code-agent').presentation.status, 'idle')
  assert.deepEqual(b.getSnapshot().dashboard, bBefore)
  const before = a.getSnapshot()
  const reopen = a.subscribe(() => {})
  assert.equal(a.getSnapshot(), before, 'opening a view reads live cached state, not a switch-time checkpoint')
  reopen()
})

test('a throwing view subscriber cannot turn valid business data into a refresh failure', async t => {
  t.mock.method(console, 'warn', () => {})
  const session = setup(t)
  await session.refresh()
  const seen = []
  t.after(session.subscribe(() => { throw new Error('broken view') }))
  t.after(session.subscribe(() => seen.push(session.getSnapshot())))
  await assert.doesNotReject(session.refresh())
  assert.equal(session.getSnapshot().dashboardError, null)
  assert.equal(seen.length, 1)
  await assert.doesNotReject(session.execute({ type: 'task.complete', taskId: 'market-research' }))
  assert.equal(session.getSnapshot().dashboard.tasks.find(task => task.id === 'market-research').status, 'completed')
})

test('animation time cannot create business progress or enable demo in a real-data session', async t => {
  const session = setup(t)
  await session.refresh()
  const before = session.getSnapshot().dashboard
  const records = session.runtime.snapshot().records.length
  assert.equal(session.simulation.canDemo, false)
  assert.throws(() => session.simulation.setDemo(true), /真实数据/)
  for (let i = 0; i < 200; i++) advanceOfficeTeamSessions([session], 1000)
  assert.deepEqual(session.getSnapshot().dashboard, before)
  assert.equal(session.runtime.snapshot().records.length, records)
})

test('explicit example choreography does not complete business tasks', async t => {
  const session = setup(t, 'team-a', new ExampleOfficeDataSource())
  await session.refresh()
  const before = session.getSnapshot().dashboard
  advanceOfficeTeamSessions([session], 50)
  assert.equal(session.runtime.snapshot().activities.length, 0, 'demo is opt-in, not automatic')
  session.simulation.setDemo(true)
  advanceOfficeTeamSessions([session], 50)
  assert.equal(session.runtime.snapshot().activities.length, 3)
  assert.deepEqual(session.getSnapshot().dashboard, before)
})

test('handoffs are consumed once across view subscriptions and repeated snapshots', async t => {
  const session = setup(t)
  await session.refresh()
  await session.execute({ type: 'task.assign', taskId: 'report', assigneeId: 'file-agent' })
  const visits = () => session.runtime.snapshot().records.filter(record => record.command.capability === 'office.visit')
  assert.equal(visits().length, 1)
  session.subscribe(() => {})()
  await session.refresh(); await session.refresh()
  assert.equal(visits().length, 1)
})

test('a completed assignment in the latest snapshot is not replayed as a stale handoff', async t => {
  const original = new ExampleOfficeDataSource()
  let notify
  const source = { kind: 'http', getSnapshot: () => original.getSnapshot(), execute: action => original.execute(action), subscribe: listener => { notify = listener; return () => {} } }
  const session = setup(t, 'team-a', source)
  await session.refresh()
  await original.execute({ type: 'task.assign', taskId: 'report', assigneeId: 'file-agent' })
  await original.execute({ type: 'task.start', taskId: 'report' })
  await original.execute({ type: 'task.complete', taskId: 'report' })
  notify(); await session.refresh()
  assert.equal(session.runtime.snapshot().records.filter(record => record.command.capability === 'office.visit').length, 0)
})

test('background scene commands target their own runtime and visual completion does not complete the task', async t => {
  let now = 0
  const a = setup(t, 'team-a', remoteSource(), { runtime: { now: () => now } }), b = setup(t, 'team-b')
  await Promise.all([a.refresh(), b.refresh()])
  const before = a.getSnapshot().dashboard
  const result = a.runtime.submit(visitCommand(a.runtime, 1, [2], () => '处理当前任务。'))
  for (let i = 0; i < 1500 && a.runtime.getRecord(result.commandId).status !== 'completed'; i++) {
    now += 50; advanceOfficeTeamSessions([a, b], 50)
  }
  assert.equal(a.runtime.getRecord(result.commandId).status, 'completed')
  assert.equal(b.runtime.snapshot().activities.length, 0)
  assert.deepEqual(a.getSnapshot().dashboard, before)
  a.runtime.submit(presentationCommand(a.runtime, a.runtime.readActors()[0].id, 'working', '只影响 A'))
  assert.equal(a.runtime.readActors()[0].presentation.title, '只影响 A')
  assert.notEqual(b.runtime.readActors()[0].presentation.title, '只影响 A')
})

test('invalidations are coalesced and fetches are serialized', async t => {
  const snapshot = await new ExampleOfficeDataSource().getSnapshot()
  const requests = []
  let notify
  const source = { kind: 'http', execute: async () => {}, subscribe: listener => { notify = listener; return () => {} }, getSnapshot: () => new Promise(resolve => requests.push(resolve)) }
  const session = setup(t, 'team-a', source)
  assert.equal(requests.length, 1)
  notify(); notify()
  const drained = session.refresh()
  assert.equal(requests.length, 1, 'notifications must not create concurrent requests')
  requests[0](snapshot)
  await Promise.resolve(); await Promise.resolve()
  assert.equal(requests.length, 2)
  requests[1]({ ...snapshot, workspace: { ...snapshot.workspace, name: '最新状态' } })
  await drained
  assert.equal(requests.length, 2)
  assert.equal(session.getSnapshot().dashboard.workspace.name, '最新状态')
})

test('stop/restart ignores old responses and cleans up each connection exactly once', async t => {
  const snapshot = await new ExampleOfficeDataSource().getSnapshot()
  const requests = [], status = []
  let subscriptions = 0, unsubscriptions = 0, connects = 0, disconnects = 0
  const source = { kind: 'http', execute: async () => {}, subscribe: () => { subscriptions++; return () => { unsubscriptions++ } }, getSnapshot: () => new Promise(resolve => requests.push(resolve)) }
  const session = setup(t, 'team-a', source, { transport: listener => { connects++; status.push(listener); return () => { disconnects++ } } })
  session.start()
  assert.equal(subscriptions, 1)
  session.stop(); session.stop()
  const drained = session.start()
  requests[1]({ ...snapshot, workspace: { ...snapshot.workspace, name: '新连接数据' } })
  await drained
  status[1]('新连接')
  requests[0]({ ...snapshot, workspace: { ...snapshot.workspace, name: '旧连接数据' } })
  status[0]('旧连接')
  await Promise.resolve(); await Promise.resolve()
  assert.equal(session.getSnapshot().dashboard.workspace.name, '新连接数据')
  assert.equal(session.getSnapshot().connection, '新连接')
  session.stop()
  assert.deepEqual([subscriptions, unsubscriptions, connects, disconnects], [2, 2, 2, 2])
})

test('refresh errors retain the last valid state and clear after recovery', async t => {
  const original = remoteSource()
  let fail = false
  const session = setup(t, 'team-a', { ...original, getSnapshot: async () => { if (fail) throw new Error('网络暂时中断'); return original.getSnapshot() } })
  await session.refresh()
  const before = session.getSnapshot().dashboard
  fail = true; await session.refresh()
  assert.equal(session.getSnapshot().dashboard, before)
  assert.match(session.getSnapshot().dashboardError, /网络暂时中断/)
  fail = false; await session.refresh()
  assert.equal(session.getSnapshot().dashboardError, null)
})

test('a team subscription setup failure is isolated and can be retried without restarting healthy teams', async t => {
  const original = remoteSource(), badRuntime = createOfficeRuntime({ sceneId: 'bad' }), goodRuntime = createOfficeRuntime({ sceneId: 'good' })
  let fail = true, subscriptions = 0, healthySubscriptions = 0
  const bad = new OfficeTeamSession(badRuntime, { ...original, subscribe(listener) {
    subscriptions++
    if (fail) throw new Error('subscription failed')
    return original.subscribe(listener)
  } })
  const good = new OfficeTeamSession(goodRuntime, { ...remoteSource(), subscribe() { healthySubscriptions++; return () => {} } })
  const host = new OfficeTeamHost()
  t.after(() => { host.stop(); badRuntime.dispose(); goodRuntime.dispose() })
  assert.doesNotThrow(() => host.update([bad, good]))
  await good.refresh()
  assert.match(bad.getSnapshot().dashboardError, /subscription failed/)
  assert.equal(bad.isStarted, false); assert(good.getSnapshot().dashboard)
  fail = false; host.update([bad, good]); await bad.refresh()
  assert.equal(bad.isStarted, true); assert.equal(bad.getSnapshot().dashboardError, null)
  assert.equal(subscriptions, 2); assert.equal(healthySubscriptions, 1)
})

test('failed transport setup rolls back subscriptions and throwing cleanup cannot block other teams', async t => {
  t.mock.method(console, 'warn', () => {})
  let released = 0, disconnects = 0, fail = true
  const source = { ...remoteSource(), subscribe: () => () => { released++; throw new Error('cleanup failed') } }
  const runtime = createOfficeRuntime(), otherRuntime = createOfficeRuntime({ sceneId: 'other' })
  const session = new OfficeTeamSession(runtime, source, { transport: () => {
    if (fail) throw new Error('transport failed')
    return () => { disconnects++ }
  } }), other = new OfficeTeamSession(otherRuntime, remoteSource())
  const host = new OfficeTeamHost()
  t.after(() => { host.stop(); runtime.dispose(); otherRuntime.dispose() })
  await session.start()
  assert.equal(released, 1); assert.equal(session.isStarted, false)
  assert.match(session.getSnapshot().dashboardError, /transport failed/)
  fail = false; host.update([session, other]); await session.refresh(); await other.refresh()
  assert.equal(session.getSnapshot().dashboardError, null)
  assert.doesNotThrow(() => host.stop())
  assert.equal(released, 2); assert.equal(disconnects, 1); assert.equal(other.isStarted, false)
})

test('authoritative snapshots clear stale work poses and repair locally overwritten presentation', async t => {
  const session = setup(t)
  await session.refresh()
  session.runtime.submit(presentationCommand(session.runtime, session.runtime.readActors()[0].id, 'working', '存档里的过期任务'))
  session.runtime.submit(presentationCommand(session.runtime, 'code-agent', 'idle'))
  await session.refresh()
  assert.equal(session.runtime.readActors()[0].presentation.status, 'idle')
  assert.equal(session.runtime.readActors()[0].presentation.title, '')
  assert.equal(session.runtime.readActors().find(actor => actor.id === 'code-agent').presentation.status, 'working')
})

test('hidden teams own pending decisions and notify the directory without a mounted office', async t => {
  const a = setup(t), b = setup(t, 'team-b')
  await Promise.all([a.refresh(), b.refresh()])
  const directory = createTeamDirectoryStore([a, b])
  let changes = 0
  const unsubscribe = directory.subscribe(() => { changes++ })
  t.after(unsubscribe)
  const initial = directory.getSnapshot()
  const request = createDecisionPreview('team-b', { name: '王明', appearanceId: 'office-lead' })[1]
  assert.equal(b.decisions.enqueue(request), true)
  const arrived = directory.getSnapshot()
  assert.equal(changes, 1)
  assert.equal(arrived[0], initial[0])
  assert.equal(arrived[1].decisions.pending.length, 1)
  assert.equal(a.decisions.resolve('team-b', request.id, 'confirm'), null)
  const reopen = b.decisions.subscribe(() => {})
  assert.equal(b.decisions.getSnapshot().pending[0], request)
  reopen()
  b.decisions.resolve('team-b', request.id, 'reject')
  assert.equal(directory.getSnapshot()[1].decisions.pending.length, 0)
  await b.refresh()
  assert.equal(b.decisions.getSnapshot().records.length, 1)
  assert.equal(b.decisions.enqueue(request), false)
  assert.equal(a.decisions.getSnapshot().records.length, 0)
})

test('decision examples are opt-in and absent from real-data teams', t => {
  const remote = setup(t, 'remote', remoteSource(), { decisionPreview: true })
  const local = setup(t, 'local', new ExampleOfficeDataSource(), { decisionPreview: true })
  assert.equal(remote.decisions.getSnapshot().pending.length, 0)
  assert.equal(local.decisions.getSnapshot().pending.length, 0, 'loading the office does not create questions')
  remote.showDecisionPreview('choice')
  local.showDecisionPreview('confirmation')
  assert.equal(remote.decisions.getSnapshot().pending.length, 0)
  assert.equal(local.decisions.getSnapshot().pending.length, 1)
  assert(local.decisions.getSnapshot().pending.every(request => request.teamId === 'local'))
})

test('demo shows exactly one confirmation at fifteen seconds and one background choice at thirty seconds', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 })
  const a = setup(t, 'local-a', new ExampleOfficeDataSource(), { decisionPreview: true })
  const b = setup(t, 'local-b', new ExampleOfficeDataSource(), { decisionPreview: true })
  const c = setup(t, 'local-c', new ExampleOfficeDataSource(), { decisionPreview: true })
  const host = new OfficeTeamHost()
  t.after(() => host.stop())
  host.update([a, b, c]); host.update([a, b, c])
  a.simulation.setDemo(true)
  assert.equal(a.decisions.getSnapshot().pending.length, 0, 'starting a new round clears old preview cards before scheduling fresh ones')
  assert.equal(b.decisions.getSnapshot().pending.length, 0)
  t.mock.timers.tick(14999)
  assert.equal(a.decisions.getSnapshot().pending.length, 0)
  assert.equal(b.decisions.getSnapshot().pending.length, 0)
  t.mock.timers.tick(1)
  assert.equal(a.decisions.getSnapshot().pending.length, 1)
  assert.equal(a.decisions.getSnapshot().pending[0].kind, 'confirmation')
  assert.equal(a.decisions.getSnapshot().pending[0].createdAt, 115000)
  assert.equal(a.decisions.getSnapshot().pending[0].expiresAt, 175000)
  assert.equal(b.decisions.getSnapshot().pending.length, 0)
  const current = a.decisions.getSnapshot().pending[0]
  a.simulation.setDemo(true)
  t.mock.timers.tick(14999)
  assert.equal(b.decisions.getSnapshot().pending.length, 0)
  t.mock.timers.tick(1)
  assert.equal(a.decisions.getSnapshot().pending[0], current, 'duplicate enabled notifications cannot restart the preview')
  assert.equal(b.decisions.getSnapshot().pending.length, 1)
  assert.equal(b.decisions.getSnapshot().pending[0].kind, 'choice')
  assert.equal(b.decisions.getSnapshot().pending[0].createdAt, 130000)
  assert.equal(b.decisions.getSnapshot().pending[0].expiresAt, 190000)
  assert.equal(c.decisions.getSnapshot().pending.length, 0, 'only one background office receives a question')
  assert(a.decisions.resolve(a.runtime.sceneId, current.id, 'confirm'))
  const side = b.decisions.getSnapshot().pending[0]
  assert(b.decisions.resolve(b.runtime.sceneId, side.id, side.options[0].id))
  t.mock.timers.tick(120000)
  assert.equal([a, b, c].flatMap(session => session.decisions.getSnapshot().pending).length, 0, 'answering both never creates follow-up questions')
})

test('stopping the demo cancels unseen previews and restarting replays resolved local questions', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 })
  const a = setup(t, 'local-a', new ExampleOfficeDataSource(), { decisionPreview: true })
  const b = setup(t, 'local-b', new ExampleOfficeDataSource(), { decisionPreview: true })
  const host = new OfficeTeamHost()
  t.after(() => host.stop())
  host.update([a, b])
  for (const session of [a, b]) for (const request of session.decisions.getSnapshot().pending) session.decisions.dismiss(request.id)
  a.simulation.setDemo(true)
  t.mock.timers.tick(15000)
  a.simulation.setDemo(false)
  t.mock.timers.tick(15000)
  assert.equal(a.decisions.getSnapshot().pending.length, 1, 'visible questions keep their ordinary deadline')
  assert.equal(b.decisions.getSnapshot().pending.length, 0)
  const first = a.decisions.getSnapshot().pending[0]
  assert(a.decisions.resolve(a.runtime.sceneId, first.id, 'confirm'))
  assert.equal(a.decisions.getSnapshot().records.length, 1)
  a.simulation.setDemo(true)
  t.mock.timers.tick(15000)
  assert.equal(a.decisions.getSnapshot().pending.length, 1)
  assert.equal(a.decisions.getSnapshot().records.length, 0)
  assert.equal(a.decisions.getSnapshot().pending[0].createdAt, 145000)
  t.mock.timers.tick(15000)
  assert.equal(b.decisions.getSnapshot().pending.length, 1)
})

test('demo preview scheduling does not reset real-data or preview-disabled teams', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const a = setup(t, 'local', new ExampleOfficeDataSource(), { decisionPreview: true })
  const remote = setup(t, 'remote', remoteSource(), { decisionPreview: true })
  const disabled = setup(t, 'disabled', new ExampleOfficeDataSource())
  const request = createDecisionPreview('remote', { name: '负责人', appearanceId: 'office-lead' })[0]
  remote.decisions.enqueue(request)
  const reset = t.mock.method(remote.decisions, 'reset')
  const disabledReset = t.mock.method(disabled.decisions, 'reset')
  const host = new OfficeTeamHost()
  t.after(() => host.stop())
  host.update([a, remote, disabled])
  a.simulation.setDemo(true)
  t.mock.timers.tick(30000)
  assert.equal(reset.mock.callCount(), 0)
  assert.equal(disabledReset.mock.callCount(), 0)
  assert.equal(remote.decisions.getSnapshot().pending[0].id, request.id)
  disabled.simulation.setDemo(true)
  t.mock.timers.tick(30000)
  assert.equal(disabledReset.mock.callCount(), 0)
})

test('removing the demo owner or stopping its host cancels pending previews', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const a = setup(t, 'local-a', new ExampleOfficeDataSource(), { decisionPreview: true })
  const b = setup(t, 'local-b', new ExampleOfficeDataSource(), { decisionPreview: true })
  const host = new OfficeTeamHost()
  t.after(() => host.stop())
  host.update([a, b])
  const reset = t.mock.method(b.decisions, 'reset')
  a.simulation.setDemo(true)
  host.update([b])
  t.mock.timers.tick(30000)
  assert.equal(reset.mock.callCount(), 0)
  b.simulation.setDemo(true)
  host.stop()
  t.mock.timers.tick(30000)
  assert.equal(reset.mock.callCount(), 0)
})

test('parallel task actions keep separate busy states and coalesce duplicate submissions', async t => {
  const waiting = new Map(), calls = []
  const source = { ...remoteSource(), execute: action => { calls.push(action); return new Promise((resolve, reject) => waiting.set(action.taskId, { resolve, reject })) } }
  const session = setup(t, 'a', source), other = setup(t, 'b')
  await session.refresh(); await other.refresh()
  const first = session.execute({ type: 'task.start', taskId: 'one' })
  const duplicate = session.execute({ type: 'task.start', taskId: 'one' })
  const second = session.execute({ type: 'task.start', taskId: 'two' })
  assert.equal(first, duplicate)
  assert.deepEqual(session.getSnapshot().pendingTaskIds, ['one', 'two'])
  assert.deepEqual(other.getSnapshot().pendingTaskIds, [])
  await Promise.resolve()
  assert.equal(calls.length, 2)
  waiting.get('one').resolve(); await first
  assert.deepEqual(session.getSnapshot().pendingTaskIds, ['two'])
  const failed = assert.rejects(second, /A failed/)
  waiting.get('two').reject(new Error('A failed')); await failed
  assert.deepEqual(session.getSnapshot().pendingTaskIds, [])
  assert.equal(session.getSnapshot().actionError, 'A failed')
  assert.equal(other.getSnapshot().actionError, null)
})

test('a task failure remains visible while another task is still pending', async t => {
  const waiting = new Map()
  const session = setup(t, 'a', { ...remoteSource(), execute: action => new Promise((resolve, reject) => waiting.set(action.taskId, { resolve, reject })) })
  const old = session.execute({ type: 'task.start', taskId: 'old' }), latest = session.execute({ type: 'task.start', taskId: 'latest' })
  await Promise.resolve()
  const rejected = assert.rejects(old, /old error/)
  waiting.get('old').reject(new Error('old error')); await rejected
  assert.equal(session.getSnapshot().actionError, 'old error')
  assert.deepEqual(session.getSnapshot().pendingTaskIds, ['latest'])
  waiting.get('latest').resolve(); await latest
  assert.equal(session.getSnapshot().actionError, 'old error', 'another task succeeding must not hide a real failure')
})

test('decision and directory portraits resolve appearance IDs rather than actor IDs', async t => {
  const runtime = createOfficeRuntime({ sceneId: 'appearance-test' })
  t.mock.method(runtime, 'readActors', () => [{ id: 'employee-1', name: 'Custom', templateId: 'file-agent' }])
  const session = new OfficeTeamSession(runtime, new ExampleOfficeDataSource(), { decisionPreview: true })
  t.after(() => { session.stop(); runtime.dispose() })
  session.showDecisionPreview('confirmation')
  assert.equal(session.decisions.getSnapshot().pending[0].requester.appearanceId, 'file-agent')
  const directory = createTeamDirectoryStore([session])
  const before = directory.getSnapshot()
  assert.equal(before[0].appearances['employee-1'], 'file-agent')
  t.mock.method(runtime, 'readActors', () => [{ id: 'employee-1', name: 'Custom', templateId: 'data-agent' }])
  assert.equal(directory.getSnapshot()[0].appearances['employee-1'], 'data-agent')
  assert.equal(directory.getSnapshot(), directory.getSnapshot())
})
