import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'

let server, demo, contract, selectors, bridge, runtimeFactory, http
before(async () => {
  server = await createTestServer()
  demo = await server.ssrLoadModule('/example/office-web/src/dashboard/demoSource.ts')
  contract = await server.ssrLoadModule('/example/office-web/src/dashboard/contract.ts')
  selectors = await server.ssrLoadModule('/example/office-web/src/dashboard/selectors.ts')
  bridge = await server.ssrLoadModule('/example/office-web/src/dashboard/sceneBridge.ts')
  runtimeFactory = await server.ssrLoadModule('/example/office-web/src/runtime/createOfficeRuntime.ts')
  http = await server.ssrLoadModule('/example/office-web/src/dashboard/httpSource.ts')
})
after(() => server?.close())

test('dashboard contract validates references and counts only real task records', async () => {
  const source = new demo.ExampleOfficeDataSource(new Date('2026-09-30T10:00:00Z'))
  const snapshot = await source.getSnapshot()
  const metrics = selectors.dashboardMetrics(snapshot, new Date('2026-09-30T12:00:00Z'))
  assert.equal(metrics.running, 2)
  assert.equal(metrics.blocked, 1)
  assert.equal(metrics.completedToday, 1)
  assert.equal(metrics.online, 6)
  assert.throws(() => contract.parseDashboardSnapshot({ ...snapshot, tasks: [{ ...snapshot.tasks[0], assigneeId: 'missing' }] }))
  assert.throws(() => contract.parseDashboardSnapshot({ ...snapshot, tasks: [{ ...snapshot.tasks[0], progress: 120 }] }))
  snapshot.tasks[0].title = 'mutated outside source'
  assert.equal((await source.getSnapshot()).tasks[0].title, '市场调研')
})

test('example source executes task actions and notifies subscribers', async () => {
  const source = new demo.ExampleOfficeDataSource()
  let changes = 0
  const unsubscribe = source.subscribe(() => { changes++ })
  await source.execute({ type: 'task.start', taskId: 'report' })
  await source.execute({ type: 'task.complete', taskId: 'report' })
  const result = await source.getSnapshot()
  assert.equal(result.tasks.find(task => task.id === 'report').status, 'completed')
  assert.equal(result.tasks.find(task => task.id === 'report').progress, 100)
  assert.equal(result.events[0].kind, 'task.completed')
  assert.equal(changes, 2)
  await assert.rejects(source.execute({ type: 'task.start', taskId: 'report' }))
  unsubscribe()
  await source.execute({ type: 'task.assign', taskId: 'compliance', assigneeId: 'file-agent' })
  assert.equal(changes, 2)
})

test('business data updates scene presentation, while handoff events replay only once', async () => {
  const source = new demo.ExampleOfficeDataSource()
  const runtime = runtimeFactory.createOfficeRuntime()
  const adapter = new bridge.DashboardSceneBridge(runtime)
  const initial = await source.getSnapshot()
  assert.deepEqual(adapter.sync(initial), [])
  assert.equal(runtime.readActors().find(actor => actor.id === 'code-agent').presentation.status, 'working')
  assert.equal(runtime.readActors().find(actor => actor.id === 'data-agent').presentation.status, 'thinking')
  assert.equal(runtime.snapshot().activities.length, 0)
  await source.execute({ type: 'task.assign', taskId: 'report', assigneeId: 'file-agent' })
  const next = await source.getSnapshot()
  assert.deepEqual(adapter.sync(next), [])
  const visits = runtime.snapshot().records.filter(record => record.command.type === 'activity.start' && record.command.capability === 'office.visit')
  assert.equal(visits.length, 1)
  adapter.sync(next)
  assert.equal(runtime.snapshot().records.filter(record => record.command.type === 'activity.start' && record.command.capability === 'office.visit').length, 1)
  assert.equal((await source.getSnapshot()).tasks.find(task => task.id === 'report').status, 'queued')
  runtime.dispose()
})

test('HTTP adapter uses a small host contract and rejects invalid snapshots', async () => {
  const source = new demo.ExampleOfficeDataSource()
  const expected = await source.getSnapshot()
  const oldFetch = globalThis.fetch
  const calls = []
  try {
    globalThis.fetch = async (url, options) => {
      calls.push([url, options])
      return { ok: true, json: async () => expected }
    }
    const remote = new http.HttpOfficeDataSource('http://127.0.0.1:18770/')
    assert.equal((await remote.getSnapshot()).workspace.id, 'office-1')
    await remote.execute({ type: 'task.start', taskId: 'report' })
    assert.equal(calls[0][0], 'http://127.0.0.1:18770/snapshot')
    assert.equal(calls[1][0], 'http://127.0.0.1:18770/actions')
    expected.tasks[0].assigneeId = 'unknown'
    await assert.rejects(remote.getSnapshot())
  } finally { globalThis.fetch = oldFetch }
})
