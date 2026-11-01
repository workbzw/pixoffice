import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTestServer } from './helpers/vite.mjs'

let server, officeActivityOverview, DispatchOfficeTools, DispatchOverviewDialog, createDispatchEnvironment, dispatchEntryUrl, sceneStorageKey, layout, useOfficeTeamDirectory, transitions
before(async () => {
  server = await createTestServer()
  ;({ officeActivityOverview } = await server.ssrLoadModule('/example/office-web/src/dashboard/officeOverview.ts'))
  ;({ DispatchOfficeTools, DispatchOverviewDialog } = await server.ssrLoadModule('/example/office-web/src/dispatch/DispatchOfficeTools.tsx'))
  ;({ createDispatchEnvironment, dispatchEntryUrl } = await server.ssrLoadModule('/example/office-web/src/dispatch/environment.ts'))
  ;({ sceneStorageKey } = await server.ssrLoadModule('@pixoffice/runtime/adapters/storage'))
  layout = await server.ssrLoadModule('/example/office-web/src/ui/officeLayout.ts')
  ;({ useOfficeTeamDirectory } = await server.ssrLoadModule('/example/office-web/src/controller/useOfficeTeamDirectory.ts'))
  transitions = await server.ssrLoadModule('/example/office-web/src/dispatch/overviewTransition.ts')
})
after(() => server?.close())

const current = {
  workspace: { id: 'one', name: '办公室一' }, employees: [], tasks: [], events: [],
  whiteboard: { title: '当前目标' },
}
const background = {
  tasks: [{ id: 'task', status: 'running' }], whiteboard: { title: '后台会话目标' },
  events: [{ id: 'new', summary: '刚完成需求核对', occurredAt: '2026-11-01T01:00:00Z' }],
}

test('dispatch activity includes unselected conversations without inferring execution from animation', () => {
  const original = structuredClone([current, background])
  assert.deepEqual(officeActivityOverview([current, background], current), {
    running: true, status: 'running', goal: '后台会话目标', latestActivity: '刚完成需求核对',
  })
  assert.deepEqual([current, background], original)
  assert.equal(officeActivityOverview([current, background], current, 1).status, 'attention')
  assert.equal(officeActivityOverview([current, background], current, 1).running, true)
  assert.equal(officeActivityOverview([background], current, 0, true).status, 'unknown')
  assert.equal(officeActivityOverview([background], current, 0, true).running, false)
  assert.equal(officeActivityOverview([], null).status, 'unknown')
  assert.equal(officeActivityOverview([], current).status, 'idle')
  assert.equal(officeActivityOverview([{ ...background, tasks: [{ status: 'completed' }] }], current).status, 'completed')
  assert.equal(officeActivityOverview([{ ...background, tasks: [{ status: 'failed' }] }], current).status, 'attention')
})

test('dispatch picks the newest business activity rather than the last array entry', () => {
  const scopes = [background, { ...current, events: [{ summary: '更早动态', occurredAt: '2026-10-31T01:00:00Z' }] }]
  assert.equal(officeActivityOverview(scopes, current).latestActivity, '刚完成需求核对')
})

test('an animation failure does not hide a valid background business task from the dispatch directory', () => {
  const state = { dashboard: current, dashboardError: '', sceneLinkError: '动画暂不可用' }
  const session = { getSnapshot: () => state, source: { getConversations: () => [current, background] }, subscribe: () => () => {},
    runtime: { sceneId: 'one', readActors: () => [], subscribe: () => () => {} } }
  let activity
  function Directory() {
    activity = useOfficeTeamDirectory([{ id: 'one', name: '办公室一', sceneLabel: '办公室' }], [session])[0].activity
    return undefined
  }
  renderToStaticMarkup(createElement(Directory))
  assert.equal(activity.running, true)
  state.dashboardError = '业务快照同步失败'
  renderToStaticMarkup(createElement(Directory))
  assert.equal(activity.status, 'unknown')
  assert.equal(activity.running, false)
})

const teams = [
  { id: 'one', name: '内容办公室', sceneLabel: '办公室', memberCount: 6, activity: { running: true, status: 'running', goal: '准备上架材料', latestActivity: '标题已更新' } },
  { id: 'two', name: '分析办公室', sceneLabel: '办公室', memberCount: 4, decisionCount: 1, activity: { running: false, status: 'attention', goal: '分析访问数据', latestActivity: '等待确认方案' } },
  { id: 'three', name: '空闲办公室', sceneLabel: '办公室', activity: { running: false, status: 'idle', goal: '', latestActivity: '' } },
]

test('dispatch ring counts running offices, exposes pending decisions and never offers fake execution controls', () => {
  const html = renderToStaticMarkup(createElement(DispatchOfficeTools, {
    teamSelection: { teams, activeId: 'one', select() {} }, onOpenChange() {},
  }))
  assert.match(html, /办公室总览，1 个运行中，共 3 个办公室，1 项待确认/)
  assert.match(html, /dispatch-running-frame/)
  assert.match(html, /data-running="true"/)
  assert.match(html, />1\/3<\/span>/)
  assert.doesNotMatch(html, /人工接管|交还 Agent|停止任务|<canvas/)
})

test('dispatch ratio handles zero offices and the maximum three-digit counts without resizing the ring', () => {
  const empty = renderToStaticMarkup(createElement(DispatchOfficeTools, { onOpenChange() {} }))
  assert.match(empty, />0\/0<\/span>/)
  const many = renderToStaticMarkup(createElement(DispatchOfficeTools, {
    teamSelection: { teams: Array.from({ length: 100 }, (_, index) => ({ ...teams[0], id: `office-${index}` })), activeId: 'office-0', select() {} }, onOpenChange() {},
  }))
  assert.match(many, /data-wide="true">100\/100<\/span>/)
})

test('dispatch overview keeps compact captions and never substitutes a representative picture for a missing live session', () => {
  const html = renderToStaticMarkup(createElement(DispatchOverviewDialog, {
    id: 'dispatch-test', selection: { teams, activeId: 'one', select() {}, create: async () => {} }, onClose() {},
  }))
  for (const team of teams) assert(html.includes(`进入${team.name}`))
  assert.match(html, /准备上架材料/)
  assert.match(html, /标题已更新/)
  assert.match(html, /1 项待确认/)
  assert.match(html, /aria-label="新建办公室"/)
  assert.match(html, /dispatch-current-label/)
  assert.match(html, />1\/3<\/span>/)
  assert.doesNotMatch(html, /site\/dispatch-preview\.webp|dispatch-page-thumbnail/)
  assert.equal((html.match(/预览未就绪/g) ?? []).length, 3)
  assert.equal((html.match(/<article class="dispatch-office-card"[^>]*data-running="true"/g) ?? []).length, 1)
  assert.doesNotMatch(html, /<canvas|dispatch-search|dispatch-card-goal|dispatch-card-latest|team-avatars|dispatch-card-footer/)
})

test('live preview pages render the corresponding office members and tasks', async () => {
  const { OfficePreviewPage } = await server.ssrLoadModule('/example/office-web/src/dispatch/OfficeLivePreview.tsx')
  const dashboard = { ...current, employees: [{ id: 'member', name: '独立分析员', role: '销售分析', sceneActorId: 'office-lead', online: true }],
    tasks: [{ id: 'task', assigneeId: 'member', title: '核对独立订单数据', summary: '仅属于分析办公室', status: 'running', progress: 32, updatedAt: '2026-11-01T01:00:00Z' }] }
  const session = { runtime: { sceneId: 'two', readActors: () => [{ id: 'office-lead', templateId: 'office-lead' }] },
    source: { kind: 'example' }, subscribe: () => () => {}, getSnapshot: () => ({ dashboard, connection: '本地示例' }),
    chat: { subscribe: () => () => {}, getSnapshot: () => ({ selectedId: 'analysis', conversations: [{ id: 'analysis', title: '独立分析会话' }] }) } }
  const html = renderToStaticMarkup(createElement(OfficePreviewPage, { session }))
  assert.match(html, /独立分析员/)
  assert.match(html, /核对独立订单数据/)
  assert.match(html, /独立分析会话/)
  assert.match(html, /class="dispatch-live-canvas"/)
})

test('overview really scales from the ring and office entry grows from the selected preview to full screen', () => {
  const origin = transitions.readOverviewOrigin({ ownerDocument: { defaultView: { innerWidth: 1440, innerHeight: 900 } },
    getBoundingClientRect: () => ({ top: 18, right: 1420, bottom: 62, left: 1376, width: 44, height: 44 }) })
  assert.deepEqual(origin, { top: 18, left: 1376, width: 44, height: 44, radius: 22 })
  assert.equal(transitions.readOverviewOrigin(null), undefined)
  let captured
  const element = { ownerDocument: { defaultView: { innerWidth: 1440, innerHeight: 900, matchMedia: () => ({ matches: false }) } },
    animate: (frames, timing) => { captured = { frames, timing }; return captured } }
  const frame = transitions.overviewOriginFrame(origin, { width: 1440, height: 900 })
  assert.equal(frame.transform, `translate(1376px, 18px) scale(${44 / 1440}, ${44 / 900})`)
  assert(!('clipPath' in frame))
  const surface = { style: {} }
  transitions.applyOverviewFrame(surface, frame)
  assert.deepEqual(surface.style, { transform: frame.transform, borderRadius: frame.borderRadius })
  transitions.animateOverview(element, frame, transitions.fullOverviewFrame)
  assert.deepEqual(captured.frames, [frame, transitions.fullOverviewFrame])
  assert.equal(captured.timing.duration, 380)
  transitions.animateOverview(element, transitions.fullOverviewFrame, frame, true)
  assert.equal(captured.timing.duration, 240)
  const preview = { left: 500, top: 120, width: 300, height: 169, radius: 24 }
  transitions.animateOfficeEntry(element, preview)
  assert.deepEqual(captured.frames, [
    { left: '500px', top: '120px', width: '300px', height: '169px', borderRadius: '24px' },
    { left: '0px', top: '0px', width: '1440px', height: '900px', borderRadius: '0px' },
  ])
  assert.equal(captured.timing.duration, 420)
  transitions.revealOffice(element)
  assert.deepEqual(captured.frames, [{ opacity: 1 }, { opacity: 0 }])
  assert.equal(captured.timing.duration, 220)
  element.ownerDocument.defaultView.matchMedia = () => ({ matches: true })
  transitions.animateOverview(element, transitions.fullOverviewFrame, frame, true)
  assert.equal(captured.timing.duration, 0)
  transitions.animateOfficeEntry(element, preview)
  assert.equal(captured.timing.duration, 0)
})

test('dispatch directory, map, chat and layout settings cannot overwrite ordinary office storage', t => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const environment = createDispatchEnvironment(storage)
  assert.equal(environment.presentation, 'reference')
  assert.equal(environment.chatKey('preview'), 'dispatch:preview')
  storage.setItem('directory', 'ordinary-directory')
  storage.setItem(sceneStorageKey('one'), 'ordinary-map')
  storage.setItem(layout.officeShellStorageKey, 'classic')
  environment.storage.setItem('directory', 'dispatch-directory')
  assert.equal(storage.getItem('directory'), 'ordinary-directory')
  assert.equal(environment.storage.getItem('directory'), 'dispatch-directory')
  const runtime = environment.createRuntime('one', true)
  t.after(() => runtime.dispose())
  runtime.submit({ protocolVersion: '2.0', sceneId: 'one', commandId: 'dispatch-save', type: 'actor.presentation.set', actorId: 'office-lead', sourceRevision: 1, status: 'working', title: '独立任务' })
  assert.equal(storage.getItem(sceneStorageKey('one')), 'ordinary-map')
  assert(storage.getItem(sceneStorageKey('one', 'dispatch')))
  for (const [key, value] of Object.entries({ localStorage: storage, location: { href: 'https://test.invalid/dispatch/', search: '' }, history: { state: {}, replaceState() {} } })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, { configurable: true, value })
    t.after(() => { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] })
  }
  layout.saveOfficeShell('rounded', environment.layoutStorageKey)
  assert.equal(storage.getItem(layout.officeShellStorageKey), 'classic')
  assert.equal(layout.readOfficeShell(environment.layoutStorageKey), 'rounded')
})

test('dispatch has a separate entry while the original office does not import its UI', async () => {
  assert.equal(dispatchEntryUrl('https://test.invalid/dispatch/?foo=1#office').href, 'https://test.invalid/dispatch/?foo=1&shell=members#office')
  assert.equal(dispatchEntryUrl('https://test.invalid/dispatch/?shell=classic').searchParams.get('shell'), 'classic')
  const entry = await readFile(new URL('../example/office-web/dispatch/index.html', import.meta.url), 'utf8')
  const original = await readFile(new URL('../example/office-web/src/main.tsx', import.meta.url), 'utf8')
  assert.match(entry, /调度办公室 · PixOffice/)
  assert.doesNotMatch(original, /dispatch|DispatchOffice/)
})
