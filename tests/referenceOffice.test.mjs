import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'
import { base, visit, completed, noClaims } from './helpers/grid.mjs'

let server, createOfficeRuntime, createReferenceOfficePresentation, DashboardSceneBridge
before(async () => {
  server = await createTestServer()
  ;({ createOfficeRuntime } = await server.ssrLoadModule('/example/office-web/src/application/createOfficeRuntime.ts'))
  ;({ createReferenceOfficePresentation } = await server.ssrLoadModule('/packages/scene-office/src/pixi/index.ts'))
  ;({ DashboardSceneBridge } = await server.ssrLoadModule('/example/office-web/src/dashboard/sceneBridge.ts'))
})
after(() => server?.close())
const create = options => createOfficeRuntime({ referenceLayout: true, ...options })

test('reference layout has six aligned workstations and a solid conference footprint', () => {
  const runtime = create()
  try {
    assert.equal(runtime.snapshot().persistenceError, undefined)
    const world = runtime.readWorld()
    assert.equal(world.props.filter(prop => prop.templateId === 'office.reference-workstation').length, 6)
    assert.deepEqual(world.actors.map(actor => actor.position), [{ x: 6, y: 7 }, { x: 13, y: 13 }, { x: 6, y: 10 }, { x: 13, y: 7 }, { x: 6, y: 13 }, { x: 13, y: 10 }])
    assert.equal(runtime.navigation.segmentClear(world, { x: 6, y: 15 }, { x: 16, y: 15 }), false)
    assert.equal(runtime.template('office.conference-table').footprint.right, 8)
    const presentation = createReferenceOfficePresentation(), actors = presentation.projectActors(runtime)
    assert.deepEqual(presentation.rendering, { idleFPS: 20, motionFPS: 30 })
    assert(actors.every(actor => actor.displayHeight === 126 && actor.label.placement === 'above' && actor.task.status === 'idle'))
    assert.deepEqual(presentation.contentBounds(world), { left: 0, top: 0, right: 1100, bottom: 850 })
  } finally { runtime.dispose() }
})

test('all thirty directed desk visits complete without crossing furniture or sharing occupied cells', () => {
  const runtime = create()
  try {
    for (const actor of runtime.readActors()) for (const host of runtime.readActors()) {
      if (actor.id === host.id) continue
      const id = `${actor.id}-${host.id}`
      const record = runtime.submit(visit(id, actor.id, host.id))
      assert.equal(record.status, 'running', JSON.stringify(record))
      completed(runtime, id); noClaims(runtime)
    }
  } finally { runtime.dispose() }
})

test('reference office separates visual activity progress from reported task progress', () => {
  const runtime = create()
  try {
    const actor = runtime.readActors()[0]
    runtime.submit({ ...base('head-task'), type: 'actor.presentation.set', actorId: actor.id,
      status: 'working', title: '登录接口', sourceRevision: actor.presentation.sourceRevision + 1 })
    const projected = createReferenceOfficePresentation().projectActors(runtime)
    assert.equal(projected[0].title, '登录接口')
    assert.deepEqual(projected[0].label, { placement: 'above', scale: 1.25 })
    assert.deepEqual(projected[0].task, { title: '登录接口', status: 'running', progressMode: 'activity' })
    assert.equal(projected[1].title, undefined, 'idle actors do not get placeholder tasks')
    assert.equal(projected[1].task.status, 'idle')
    const real = createReferenceOfficePresentation({ taskForActor: id => id === actor.id ? { title: '登录接口', status: 'running', progress: 72, detail: '核验登录接口' } : undefined })
    assert.equal(real.projectActors(runtime)[0].task.progress, 72)
    runtime.submit({ ...base('new-head-task'), type: 'actor.presentation.set', actorId: actor.id,
      status: 'working', title: '新的任务', sourceRevision: runtime.readActors()[0].presentation.sourceRevision + 1 })
    assert.equal(real.projectActors(runtime)[0].task.progress, undefined, 'old task progress never leaks into a new task')
  } finally { runtime.dispose() }
})

test('office work effects preserve all actor intents and require the shared atlas before mounting', () => {
  const runtime = create()
  try {
    const actorId = 'app-agent'
    for (const actor of runtime.readActors()) runtime.submit({ ...base(`work-${actor.id}`), type: 'actor.presentation.set', actorId: actor.id,
      status: 'working', title: 'Development', sourceRevision: actor.presentation.sourceRevision + 1 })
    const original = createReferenceOfficePresentation().projectActors(runtime)
    const pack = createReferenceOfficePresentation({ workEffects: true })
    const actors = pack.projectActors(runtime)
    assert.equal(original.find(actor => actor.id === actorId).intent.actionId, 'office.type')
    assert.deepEqual(actors, original)
    assert.equal(pack.resourceCount, 9)
    assert.throws(() => pack.createAmbientViews(runtime), /Load the office crafting atlas/)
    assert.equal(runtime.readActors().find(actor => actor.id === actorId).presentation.status, 'working')
  } finally { runtime.dispose() }
})

test('business completion leaves a completed monitor card while the actor idles, then a new task replaces it', async t => {
  const runtime = create(); t.after(() => runtime.dispose())
  const { officeActorTasks } = await server.ssrLoadModule('/example/office-web/src/dashboard/actorTasks.ts')
  const actorId = runtime.readActors()[0].id
  const data = { schemaVersion: '1.0', workspace: { id: runtime.sceneId, name: '测试' },
    employees: [{ id: 'worker', sceneActorId: actorId, name: '功能' }], events: [], tasks: [
      { id: 'task', assigneeId: 'worker', title: '当前任务', status: 'running', progress: 25, updatedAt: '2026-10-18T10:00:00Z' },
    ] }
  const bridge = new DashboardSceneBridge(runtime)
  let tasks = officeActorTasks(data)
  const presentation = createReferenceOfficePresentation({ taskForActor: id => tasks.get(id) })
  bridge.sync(data)
  assert.equal(presentation.projectActors(runtime)[0].task.status, 'running')
  data.tasks[0].status = 'completed'
  tasks = officeActorTasks(data); bridge.sync(data)
  const finished = presentation.projectActors(runtime)[0]
  assert.equal(runtime.readActors()[0].presentation.status, 'idle')
  assert.equal(finished.task.status, 'completed')
  assert.equal(finished.task.id, 'task')
  assert.equal(finished.task.progressMode, 'activity')
  assert.equal(data.tasks[0].progress, 25, 'display completion does not rewrite reported business progress')
  data.tasks.push({ id: 'next', assigneeId: 'worker', title: '下一项任务', status: 'running', updatedAt: '2026-10-18T11:00:00Z' })
  tasks = officeActorTasks(data); bridge.sync(data)
  const next = presentation.projectActors(runtime)[0]
  assert.equal(next.task.id, 'next')
  assert.equal(next.task.status, 'running')
  assert.equal(next.task.progress, undefined, 'new work does not inherit the completed task percentage')
})

test('translucent task cards stay at the right of each home monitor during visits and follow edited workstations', () => {
  const runtime = create()
  try {
    const presentation = createReferenceOfficePresentation(), initial = presentation.projectActors(runtime)
    assert(initial.every(actor => actor.taskAnchor?.placement === 'right' && actor.taskAnchor.x > actor.position.x))
    runtime.submit(visit('fixed-monitor', initial[0].id, initial[1].id))
    for (let i = 0; i < 50; i++) runtime.tick(50)
    const walking = presentation.projectActors(runtime)[0]
    assert.notDeepEqual(walking.position, initial[0].position)
    assert.deepEqual(walking.taskAnchor, initial[0].taskAnchor)
    const preview = runtime.readWorld(), desk = preview.props.find(prop => prop.id === initial[0].furniture.propId)
    desk.position.x += 1; desk.position.y += 1
    const edited = presentation.projectActors(runtime, preview)[0]
    assert.equal(edited.taskAnchor.x, initial[0].taskAnchor.x + 50)
    assert.equal(edited.taskAnchor.y, initial[0].taskAnchor.y + 50)
  } finally { runtime.dispose() }
})

test('wall board supports four-person meetings and every participant returns to their own seat', () => {
  const runtime = create()
  try {
    const participants = runtime.readActors().slice(0, 4).map((actor, i) => ({ entityId: actor.id, role: i ? 'attendee' : 'speaker' }))
    const record = runtime.submit({ ...base('meeting'), type: 'activity.start', capability: 'office.meeting', participants, params: { boardId: 'whiteboard-1', text: '同步进度', durationMs: 1000 } })
    assert.equal(record.status, 'running', JSON.stringify(record))
    completed(runtime, 'meeting'); noClaims(runtime)
    assert(runtime.readActors().every(actor => actor.posture === 'seated' && actor.using.propId === actor.homeId))
  } finally { runtime.dispose() }
})

test('current reference office restores its business state and history without any upgrade or backup', () => {
  const first = create(), original = first.checkpoint()
  first.dispose()
  original.world.actors[0].name = '自定义负责人'
  original.world.actors[0].presentation = { status: 'working', title: '保留任务', sourceRevision: 2 }
  original.world.props.find(prop => prop.id === 'whiteboard-1').state = { title: '保留标题', taskBoard: { template: 'task-board-v1', title: '保留白板内容', status: 'running', steps: [] } }
  let stored = structuredClone(original)
  const backups = [], persistence = { load: () => stored, save: next => { stored = structuredClone(next) }, replaceWithBackup(expected, next) {
    assert.deepEqual(expected, stored); backups.push(structuredClone(stored)); stored = structuredClone(next)
  } }
  const runtime = create({ persistence })
  try {
    assert.equal(runtime.snapshot().persistenceError, undefined)
    assert.deepEqual(backups, [])
    assert.equal(runtime.readActors()[0].name, '自定义负责人')
    assert.equal(runtime.readActors()[0].presentation.title, '保留任务')
    assert.equal(runtime.readWorld().props.find(p => p.id === 'whiteboard-1').state.taskBoard.title, '保留白板内容')
    const reloaded = create({ persistence }); reloaded.dispose()
    assert.equal(backups.length, 0)
  } finally { runtime.dispose() }
})

test('a different office layout is rejected rather than converted into the reference layout', () => {
  const classic = createOfficeRuntime(), original = classic.checkpoint(); classic.dispose()
  original.world.props[0].position.x += 1
  original.world.actors[0].position.x += 1
  let stored = original
  const runtime = create({ persistence: { load: () => stored, save: next => { stored = next }, replaceWithBackup(_expected, next) { stored = next } } })
  assert(runtime.snapshot().persistenceError)
  assert.deepEqual(stored, original)
  assert.equal(runtime.snapshot().canRecoverLayout, false)
  runtime.dispose()
  let writes = 0
  const locked = create({ persistence: { load: () => original, save: () => writes++ } })
  assert(locked.snapshot().persistenceError); assert.equal(writes, 0); locked.dispose()
})

test('current saved canvas dimensions are restored without implicit layout rewriting', () => {
  const first = create(), original = first.checkpoint(); first.dispose()
  original.world.height = 18
  let stored = structuredClone(original)
  const backups = [], runtime = create({ persistence: { load: () => stored, save: next => { stored = next }, replaceWithBackup(expected, next) {
    backups.push(structuredClone(expected)); stored = next
  } } })
  assert.equal(runtime.snapshot().persistenceError, undefined)
  assert.deepEqual(backups, [])
  assert.equal(runtime.readWorld().height, 18)
  assert.deepEqual(runtime.readWorld().props, original.world.props)
  runtime.dispose()
})

test('dashboard updates real whiteboard tasks and does not write duplicate snapshots', () => {
  const runtime = create(), bridge = new DashboardSceneBridge(runtime, { whiteboard: 'demo-summary' })
  try {
    const data = { schemaVersion: '1.0', workspace: { id: 'test', name: '研发团队' }, employees: [], events: [], tasks: [
      { id: 'task-1', title: '资料搜集', status: 'running', progress: 62, updatedAt: '2026-10-15T00:00:00Z' },
    ] }
    assert.deepEqual(bridge.sync(data), [])
    const board = () => runtime.readWorld().props.find(p => p.id === 'whiteboard-1')
    assert.equal(board().state.tasks[0].progress, 62)
    const revision = board().stateRevision
    assert.deepEqual(bridge.sync(data), []); assert.equal(board().stateRevision, revision)
    data.tasks[0].progress = 100; data.tasks[0].status = 'completed'
    bridge.sync(data); assert.equal(board().state.tasks[0].status, 'completed')
  } finally { runtime.dispose() }
})

test('the local programming example populates the wall board and tracks task actions', async () => {
  const { codingOfficeExample } = await server.ssrLoadModule('/example/office-web/src/dashboard/codingExample.ts')
  const { ExampleOfficeDataSource } = await server.ssrLoadModule('/example/office-web/src/dashboard/demoSource.ts')
  const source = new ExampleOfficeDataSource(new Date('2026-10-15T00:00:00Z'), codingOfficeExample)
  const runtime = create(), bridge = new DashboardSceneBridge(runtime, { whiteboard: 'demo-summary' })
  try {
    assert.deepEqual(bridge.sync(await source.getSnapshot()), [])
    const board = () => runtime.readWorld().props.find(prop => prop.id === 'whiteboard-1').state
    assert.equal(board().title, '登录模块开发')
    assert.deepEqual(board().tasks.slice(0, 4).map(task => task.title), ['需求拆解', '登录接口', '登录页面', '联调测试'])
    assert.equal(runtime.readActors().find(a => a.id === 'file-agent').presentation.status, 'working')
    await source.execute({ type: 'task.complete', taskId: 'login-api' })
    bridge.sync(await source.getSnapshot())
    assert.equal(board().tasks.find(task => task.title === '登录接口').progress, 100)
    assert.equal(codingOfficeExample.tasks.find(task => task.id === 'login-api').progress, 72, 'seed data is not mutated')
  } finally { runtime.dispose() }
})
