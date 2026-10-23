import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'

let server, schema, render, renderPreview, previewLayout, read, toBoard
before(async () => {
  server = await createTestServer()
  ;({ whiteboardTaskBoardSchema: schema, whiteboardTaskBoard: read } = await server.ssrLoadModule('/packages/scene-office/src/whiteboard.ts'))
  ;({ renderWhiteboardContent: render, renderWhiteboardPreview: renderPreview, WHITEBOARD_PREVIEW_LAYOUT: previewLayout } = await server.ssrLoadModule('/packages/scene-office/src/taskBoard.ts'))
  ;({ dashboardWhiteboardTaskBoard: toBoard } = await server.ssrLoadModule('/example/office-web/src/dashboard/whiteboard.ts'))
})
after(() => server?.close())
const sample = () => schema.parse({ template: 'task-board-v1', title: '竞品对比报告', status: 'running', description: '对标产品，核验信息。',
  note: '更好的产品，源于真实的比较。', steps: [
    { id: 'collect', title: '资料搜集', progress: 68 },
    { id: 'verify', title: '交叉核验', progress: 46 },
    { id: 'report', title: '报告整理', progress: 58 },
  ] })

test('the fixed whiteboard template renders a status, summary, note and three numbered progress rows', () => {
  const html = render({ taskBoard: sample() })
  for (const text of ['执行中', '竞品对比报告', '对标产品，核验信息。', '更好的产品', '68%', '46%', '58%', '把计划变成成果']) assert(html.includes(text), text)
  assert.equal((html.match(/role="progressbar"/g) ?? []).length, 3)
  assert(html.includes('lucide-lightbulb'))
  assert(html.includes('grid-template-columns:'))
  assert(html.includes('background:#fff0ad'))
})

test('the scene increases text size within the fixed surface without changing the reader typography', () => {
  const state = { taskBoard: sample() }, content = render(state, 'wall'), preview = renderPreview(state)
  assert.deepEqual(previewLayout, { width: 778, height: 314, fontSize: 26 })
  assert(preview.includes('width:778px;height:314px'))
  assert(preview.includes('padding:8px 24px 16px;font-size:26px'))
  assert(preview.includes('border-radius:8px;overflow:hidden'))
  assert(preview.includes('background:transparent;border-radius:8px'))
  assert(!preview.includes('background:#fcfcfb'))
  assert(preview.includes(content))
  assert(content.includes('padding:.1em 0 .3em'))
  assert(content.includes('font-size:.8em;color:#68758a'), 'wall percentages are larger')
  assert(render(state).includes('padding:.2em 0 .8em'), 'reader spacing remains unchanged')
})

test('wall progress rows reveal the board material while the expanded reader keeps its paper surface', () => {
  const state = { taskBoard: sample() }, wall = render(state, 'wall'), paper = render(state)
  assert.equal((wall.match(/border:none;border-radius:6px;background:transparent;box-shadow:none/g) ?? []).length, 3)
  assert(!wall.includes('background:#ffffffb3'))
  assert(wall.includes('background:#78848e26'))
  assert(paper.includes('background:#ffffffb3;box-shadow:0 1px 3px #2339570a'))
  assert(paper.includes('border:1px solid #e4e8ed'), 'expanded reader styling is unchanged')
  for (const html of [wall, paper]) {
    assert(html.includes('grid-template-columns:minmax(0,1fr) minmax(0,1.15fr)'))
    assert.equal((html.match(new RegExp(`height:${html === wall ? '2.35' : '2.65'}em`, 'g')) ?? []).length, 3)
    for (const progress of ['68%', '46%', '58%']) assert(html.includes(progress))
  }
})

test('the scene whiteboard adds only dynamic text, preserving the room artwork as its sole physical frame', async () => {
  const { createReferenceOfficePropViews } = await server.ssrLoadModule('/packages/scene-office/src/pixi/views/referenceOffice.ts')
  const { createOfficeRuntime } = await server.ssrLoadModule('/example/office-web/src/application/createOfficeRuntime.ts')
  const runtime = createOfficeRuntime({ referenceLayout: true })
  const prop = runtime.readWorld().props.find(item => item.id === 'whiteboard-1'), template = runtime.template(prop.templateId)
  const view = createReferenceOfficePropViews().create(prop, template)
  try {
    assert.equal(view.roots.length, 1)
    assert.deepEqual(view.roots[0].children.map(child => child.constructor.name), ['HTMLText'])
    view.update(prop, template, [])
    const text = view.roots[0].children[0]
    assert(text.text.includes('background:transparent'))
    assert.deepEqual({ x: text.x, y: text.y }, { x: 71, y: -157 })
    assert.equal(text.scale.x, text.scale.y)
  } finally { view.roots.forEach(root => root.destroy({ children: true })); runtime.dispose() }
})

test('task board content cannot inject markup, styles or executable links', () => {
  const board = sample(); board.title = '<img src=x onerror=alert(1)>'; board.note = '<script>bad()</script>'
  board.steps[0].title = '" onmouseover="alert(1)'
  const html = render({ taskBoard: board })
  assert(!html.includes('<img')); assert(!html.includes('<script>'))
  assert(html.includes('&lt;img')); assert(html.includes('&lt;script&gt;'))
  for (const url of ['javascript:alert(1)', 'data:text/html,evil', 'not-a-url']) assert.equal(schema.safeParse({ ...sample(), link: { label: '资料', url } }).success, false)
  assert.equal(schema.safeParse({ ...sample(), css: 'display:none' }).success, false)
  assert(render({ taskBoard: { ...sample(), link: { label: '项目资料', url: 'https://example.com/' } } }).includes('rel="noopener noreferrer"'))
})

test('only structured task data renders; retired free-form fields cannot override the template', () => {
  assert.deepEqual(read({ markdown: '', taskBoard: sample() }), sample())
  assert(render({ markdown: '# 自定义', taskBoard: sample() }).includes('task-whiteboard'))
  assert(!render({ markdown: '# 自定义', taskBoard: sample() }).includes('自定义'))
  assert(!render({ text: '# 旧白板' }).includes('<h1'))
  assert.equal(read({ text: '# 旧白板' }), null)
})

test('the template bounds its rows and progress and does not invent unknown percentages', () => {
  assert.equal(schema.safeParse({ ...sample(), steps: [...sample().steps, { id: 'extra', title: '额外' }] }).success, false)
  assert.equal(schema.safeParse({ ...sample(), steps: [{ id: 'bad', title: '错误', progress: 101 }] }).success, false)
  const html = render({ taskBoard: { ...sample(), steps: [{ id: 'unknown', title: '等待数据' }] } })
  assert(!html.includes('0%<'))
  assert(!html.includes('aria-valuenow'))
})

test('commerce boards use explicit business stages without leaking the retired programming template', async () => {
  const { CommerceOfficeDataSource } = await server.ssrLoadModule('/example/office-web/src/dashboard/CommerceOfficeDataSource.ts')
  const source = new CommerceOfficeDataSource('operations')
  const before = (await source.getSnapshot()).whiteboard
  assert.deepEqual(before.steps.map(step => [step.title, step.progress]), [['商品与上架', 0], ['销量与反馈', 0], ['优化与复盘', 0]])
  source.applyStage('observing')
  assert.deepEqual((await source.getSnapshot()).whiteboard.steps.map(step => step.progress), [100, 20, 0])
  assert.equal(before.steps[0].progress, 0)
  source.applyStage('completed')
  assert.equal((await source.getSnapshot()).whiteboard.status, 'completed')
})

test('empty and partial backend task data remain honest and team-local', () => {
  assert.deepEqual(toBoard({ workspace: { name: '空团队' }, tasks: [] }).steps, [])
  const board = toBoard({ workspace: { name: '另一个团队' }, tasks: [{ id: 'a', title: '采集信息', status: 'running' }] })
  assert.equal(board.title, '另一个团队')
  assert.equal(board.steps[0].progress, undefined)
})

test('the runtime rejects retired fields and refreshes the fixed task template from business data', async () => {
  const { createOfficeRuntime } = await server.ssrLoadModule('/example/office-web/src/application/createOfficeRuntime.ts')
  const { DashboardSceneBridge } = await server.ssrLoadModule('/example/office-web/src/dashboard/sceneBridge.ts')
  const runtime = createOfficeRuntime({ referenceLayout: true }), bridge = new DashboardSceneBridge(runtime, { whiteboard: 'demo-summary' })
  const data = { workspace: { name: '测试团队' }, employees: [], events: [], tasks: [{ id: 'a', title: '采集信息', status: 'running', progress: 68 }] }
  const board = () => runtime.readWorld().props.find(prop => prop.id === 'whiteboard-1')
  const update = state => runtime.submit({ protocolVersion: '2.0', sceneId: runtime.sceneId, commandId: crypto.randomUUID(),
    type: 'object.state.set', entityId: board().id, expectedStateRevision: board().stateRevision, state })
  try {
    assert.deepEqual(bridge.sync(data), [])
    assert.equal(read(board().state).steps[0].progress, 68)
    assert.equal(update({ ...board().state, taskBoard: { ...sample(), steps: [{ id: 'bad', title: '错误', progress: -2 }] } }).status, 'failed')
    assert.equal(update({ ...board().state, markdown: '# 手动内容' }).status, 'failed')
    assert.equal(update({ ...board().state, text: '旧内容' }).status, 'failed')
    data.tasks[0].progress = 80; bridge.sync(data)
    assert.equal(board().state.taskBoard.steps[0].progress, 80)
    assert.equal(read(board().state).steps[0].progress, 80)
  } finally { runtime.dispose() }
})

test('external whiteboard content remains authoritative across unchanged and changed business snapshots', async () => {
  const { createOfficeRuntime } = await server.ssrLoadModule('/example/office-web/src/application/createOfficeRuntime.ts')
  const { DashboardSceneBridge } = await server.ssrLoadModule('/example/office-web/src/dashboard/sceneBridge.ts')
  for (const mode of ['external', 'demo-summary']) {
    const runtime = createOfficeRuntime({ referenceLayout: true }), bridge = new DashboardSceneBridge(runtime, { whiteboard: mode })
    try {
      const data = { workspace: { name: '团队摘要' }, employees: [], events: [], tasks: [] }
      bridge.sync(data)
      const board = () => runtime.readWorld().props.find(prop => prop.id === 'whiteboard-1')
      const content = { title: '后端白板', taskBoard: sample() }
      assert.equal(runtime.submit({ protocolVersion: '2.0', sceneId: runtime.sceneId, commandId: crypto.randomUUID(),
        type: 'object.state.set', entityId: board().id, expectedStateRevision: board().stateRevision, state: content }).status, 'completed')
      const revision = board().stateRevision
      bridge.sync(data); data.workspace.name = '更新摘要'; bridge.sync(data)
      assert.deepEqual(board().state, content); assert.equal(board().stateRevision, revision)
      const recreated = new DashboardSceneBridge(runtime, { whiteboard: mode })
      recreated.sync(data)
      assert.deepEqual(board().state, content, 'recreating the bridge must not claim an already-authored board')
    } finally { runtime.dispose() }
  }
})

test('business snapshots do not claim the whiteboard unless demo summary is explicitly enabled', async () => {
  const { createOfficeRuntime } = await server.ssrLoadModule('/example/office-web/src/application/createOfficeRuntime.ts')
  const { OfficeTeamSession } = await server.ssrLoadModule('/example/office-web/src/application/OfficeTeamSession.ts')
  const { ExampleOfficeDataSource } = await server.ssrLoadModule('/example/office-web/src/dashboard/demoSource.ts')
  const original = new ExampleOfficeDataSource(), runtime = createOfficeRuntime({ referenceLayout: true })
  const session = new OfficeTeamSession(runtime, { kind: 'http', getSnapshot: async () => { const snapshot = await original.getSnapshot(); delete snapshot.whiteboard; return snapshot }, subscribe: listener => original.subscribe(listener), execute: action => original.execute(action) })
  try {
    const before = runtime.readWorld().props.find(prop => prop.id === 'whiteboard-1')
    await session.start(); await session.refresh()
    assert.deepEqual(runtime.readWorld().props.find(prop => prop.id === 'whiteboard-1'), before)
  } finally { session.stop(); runtime.dispose() }
})
