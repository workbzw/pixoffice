import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let server, demo, contract, selectors, bridge, runtimeFactory
before(async () => {
  server = await createTestServer()
  demo = await server.ssrLoadModule('/example/office-web/src/dashboard/demoSource.ts')
  contract = await server.ssrLoadModule('@pixoffice/protocol/dashboard')
  selectors = await server.ssrLoadModule('/example/office-web/src/dashboard/selectors.ts')
  bridge = await server.ssrLoadModule('/example/office-web/src/dashboard/sceneBridge.ts')
  runtimeFactory = await server.ssrLoadModule('/example/office-web/src/application/createOfficeRuntime.ts')
})
after(() => server?.close())

test('removing business members clears their stale work presentation without removing scene actors', async t => {
  const source = new demo.ExampleOfficeDataSource(), runtime = runtimeFactory.createOfficeRuntime()
  t.after(() => runtime.dispose())
  const adapter = new bridge.DashboardSceneBridge(runtime), snapshot = await source.getSnapshot()
  adapter.sync(snapshot)
  assert.equal(runtime.readActors().find(actor => actor.id === 'app-agent').presentation.status, 'working')
  snapshot.employees = snapshot.employees.filter(employee => employee.id !== 'app-agent')
  snapshot.tasks = snapshot.tasks.filter(task => task.assigneeId !== 'app-agent')
  assert.deepEqual(adapter.sync(contract.parseDashboardSnapshot(snapshot)), [])
  const actors = runtime.readActors()
  assert.equal(actors.length, 6)
  assert.equal(actors.find(actor => actor.id === 'app-agent').presentation.status, 'idle')
  assert.equal(actors.find(actor => actor.id === 'app-agent').presentation.title, '')
  assert.equal(actors.find(actor => actor.id === 'code-agent').presentation.status, 'working')
})

test('multiple business employees can bind to one scene actor while business IDs remain unique', async () => {
  const snapshot = await new demo.ExampleOfficeDataSource().getSnapshot()
  snapshot.employees[1].sceneActorId = snapshot.employees[0].sceneActorId
  assert.doesNotThrow(() => contract.parseDashboardSnapshot(snapshot))
  const duplicateId = structuredClone(snapshot)
  duplicateId.employees.push({ ...duplicateId.employees[0] })
  assert.throws(() => contract.parseDashboardSnapshot(duplicateId), /员工 ID 重复/)
  delete snapshot.employees[0].sceneActorId
  delete snapshot.employees[1].sceneActorId
  assert.doesNotThrow(() => contract.parseDashboardSnapshot(snapshot), 'unmapped business members are allowed')
})

test('shared actor presentation and task badge select the same task without replacing the actor identity', async t => {
  const snapshot = await new demo.ExampleOfficeDataSource().getSnapshot()
  snapshot.employees.find(employee => employee.id === 'app-agent').sceneActorId = 'code-agent'
  const runtime = runtimeFactory.createOfficeRuntime()
  t.after(() => runtime.dispose())
  const adapter = new bridge.DashboardSceneBridge(runtime)
  const { officeActorTasks } = await server.ssrLoadModule('/example/office-web/src/dashboard/actorTasks.ts')
  const original = runtime.readActors().find(actor => actor.id === 'code-agent')
  const codeTask = snapshot.tasks.find(task => task.id === 'market-research')
  const writingTask = snapshot.tasks.find(task => task.id === 'copywriting')
  codeTask.updatedAt = '2026-10-18T10:00:00Z'
  writingTask.updatedAt = '2026-10-18T10:01:00Z'
  const assertSelected = title => {
    assert.deepEqual(adapter.sync(contract.parseDashboardSnapshot(snapshot)), [])
    const actor = runtime.readActors().find(item => item.id === 'code-agent')
    assert.equal(actor.presentation.status, 'working')
    assert.equal(actor.presentation.title, title)
    assert.equal(officeActorTasks(snapshot).get(actor.id).title, title)
    for (const key of ['id', 'name', 'templateId', 'homeId']) assert.deepEqual(actor[key], original[key])
    assert.equal(runtime.readActors().length, 6)
    assert.equal(snapshot.tasks.length, 5, 'selecting one displayed task never drops the other business tasks')
  }
  assertSelected(writingTask.title)
  writingTask.status = 'blocked'
  assertSelected(codeTask.title)
  writingTask.status = 'running'
  codeTask.status = 'completed'
  assertSelected(writingTask.title)
  snapshot.employees.reverse(); snapshot.tasks.reverse()
  assertSelected(writingTask.title)
  snapshot.employees = snapshot.employees.filter(employee => employee.id !== 'code-agent')
  snapshot.tasks = snapshot.tasks.filter(task => task.assigneeId !== 'code-agent')
  assert.deepEqual(adapter.sync(contract.parseDashboardSnapshot(snapshot)), [])
  assert.equal(runtime.readActors().find(actor => actor.id === 'code-agent').presentation.title, writingTask.title,
    'removing one shared binding must not clear another function that is still working')
})

test('handoffs between business functions bound to the same actor never create a self visit', async t => {
  const snapshot = await new demo.ExampleOfficeDataSource().getSnapshot()
  snapshot.employees.find(employee => employee.id === 'review-agent').sceneActorId = 'office-lead'
  const runtime = runtimeFactory.createOfficeRuntime()
  t.after(() => runtime.dispose())
  const adapter = new bridge.DashboardSceneBridge(runtime)
  adapter.sync(contract.parseDashboardSnapshot(snapshot))
  snapshot.events.unshift({ id: 'shared-handoff', kind: 'task.assigned', taskId: 'report', employeeId: 'review-agent',
    fromEmployeeId: 'office-lead', summary: '切换到汇报功能', occurredAt: '2026-10-18T10:00:00Z' })
  assert.deepEqual(adapter.sync(contract.parseDashboardSnapshot(snapshot)), [])
  assert.equal(runtime.snapshot().records.filter(record => record.command.type === 'activity.start').length, 0)
  assert.equal(snapshot.tasks.find(task => task.id === 'report').assigneeId, 'review-agent')
})

test('handoffs from different business functions sharing an actor use the existing local resource queue', async t => {
  const snapshot = await new demo.ExampleOfficeDataSource().getSnapshot()
  snapshot.employees.push({ id: 'another-function', sceneActorId: 'office-lead', name: '附加功能' })
  const runtime = runtimeFactory.createOfficeRuntime()
  t.after(() => runtime.dispose())
  const adapter = new bridge.DashboardSceneBridge(runtime)
  adapter.sync(contract.parseDashboardSnapshot(snapshot))
  snapshot.events = [
    { id: 'shared-second', kind: 'task.assigned', taskId: 'report', employeeId: 'review-agent', fromEmployeeId: 'another-function', summary: '第二次交接', occurredAt: '2026-10-18T10:01:00Z' },
    { id: 'shared-first', kind: 'task.assigned', taskId: 'market-research', employeeId: 'code-agent', fromEmployeeId: 'office-lead', summary: '第一次交接', occurredAt: '2026-10-18T10:00:00Z' },
  ]
  assert.deepEqual(adapter.sync(contract.parseDashboardSnapshot(snapshot)), [])
  assert.equal(snapshot.employees.length, 7, 'business functions can outnumber the six physical actors')
  assert.equal(runtime.readActors().length, 6)
  const visits = () => runtime.snapshot().records.filter(record => record.command.capability === 'office.visit')
  assert.deepEqual(visits().map(record => record.status), ['running', 'queued'])
  assert(visits().every(record => record.command.participants[0].entityId === 'office-lead'))
  adapter.sync(snapshot)
  assert.equal(visits().length, 2, 'a repeated snapshot must not enqueue the same handoffs again')
})

test('office shell has no sidebar search and preserves complete immutable dashboard data', async () => {
  const { OfficeShell } = await server.ssrLoadModule('/example/office-web/src/ui/OfficeShell.tsx')
  const snapshot = await new demo.ExampleOfficeDataSource().getSnapshot()
  const before = structuredClone(snapshot)
  Object.freeze(snapshot.tasks)
  const html = renderToStaticMarkup(createElement(OfficeShell, {
    connection: '本地示例', dashboard: snapshot, dashboardError: null, sceneLinkError: null,
    dataMode: 'example', executeAction: async () => {}, scene: 'Office scene', editing: false,
    pendingTaskIds: [], actionError: null, appearanceIds: {},
    canRecoverLayout: false, recoverLayout() {}, exportCapabilities() {}, exportSnapshot() {}, renderScenePanel: () => null,
  }))
  assert(!html.includes('搜索任务或员工'))
  assert(!html.includes('runtime-search'))
  for (const employee of snapshot.employees) assert(html.includes(employee.name))
  for (const task of snapshot.tasks.filter(task => task.status !== 'completed')) assert(html.includes(task.title))
  assert.deepEqual(snapshot, before)
})

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
