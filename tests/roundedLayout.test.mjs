import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTestServer } from './helpers/vite.mjs'

let server, RoundedOfficeShell, officeOverview, createCollaborationEnvironment, collaborationEntryUrl, sceneStorageKey, resolveOfficeShell
before(async () => {
  server = await createTestServer()
  ;({ RoundedOfficeShell } = await server.ssrLoadModule('/example/office-web/src/ui/RoundedOfficeShell.tsx'))
  ;({ officeOverview } = await server.ssrLoadModule('/example/office-web/src/dashboard/officeOverview.ts'))
  ;({ createCollaborationEnvironment, collaborationEntryUrl } = await server.ssrLoadModule('/example/office-web/src/collaboration/environment.ts'))
  ;({ sceneStorageKey } = await server.ssrLoadModule('@pixoffice/runtime/adapters/storage'))
  ;({ resolveOfficeShell } = await server.ssrLoadModule('/example/office-web/src/ui/officeLayout.ts'))
})
after(() => server?.close())

const snapshot = {
  schemaVersion: '1.0', conversationId: 'main', workspace: { id: 'team-a', name: '协作团队' },
  employees: [{ id: 'alice', name: '甲', role: '开发' }], events: [],
  tasks: ['running', 'completed', 'blocked', 'failed', 'queued'].map((status, index) => ({ id: `task-${index}`, title: `任务${index}`, status, updatedAt: '2026-10-28T10:00:00Z' })),
  whiteboard: { template: 'task-board-v1', title: '当前会话目标', status: 'running', steps: [] },
}

test('rounded overview counts only the supplied conversation and handles absent and completed state', () => {
  assert.deepEqual(officeOverview(snapshot), { total: 5, running: 1, completed: 1, attention: 2, status: '需要关注', goal: '当前会话目标' })
  assert.equal(officeOverview({ ...snapshot, tasks: [] }).status, '准备就绪')
  assert.equal(officeOverview({ ...snapshot, tasks: [snapshot.tasks[1]] }).status, '任务已完成')
  assert.equal(officeOverview({ ...snapshot, tasks: [snapshot.tasks[0]] }).status, '协作进行中')
  assert.deepEqual(officeOverview(null), { total: 0, running: 0, completed: 0, attention: 0, status: '等待初始化', goal: '当前会话暂无目标' })
})

test('rounded shell reuses the scene and member controls without duplicate office slots or fabricated metrics', () => {
  const html = renderToStaticMarkup(createElement(RoundedOfficeShell, {
    dashboard: snapshot, appearanceIds: {}, selectedEmployeeId: 'alice', scene: createElement('div', { id: 'existing-scene' }),
    connection: 'connected', dataMode: 'push', dashboardError: '', sceneLinkError: '', actionError: '',
    executeAction: async () => {}, pendingTaskIds: [], editing: false, canRecoverLayout: false,
    recoverLayout() {}, exportCapabilities() {}, exportSnapshot() {}, renderScenePanel: () => undefined,
  }))
  assert.match(html, /member-workspace rounded-workspace/)
  assert.match(html, /当前会话办公室统计/)
  assert.match(html, /当前会话目标/)
  assert.match(html, /id="existing-scene"/)
  assert.match(html, /查看甲的资料/)
  assert.match(html, /member-detail-scroll/)
  assert.match(html, /member-detail-footer/)
  assert.equal(html.split('class="member-office-control"').length - 1, 1)
  assert.doesNotMatch(html, /CPU|内存|种植|收获|今日产出/)
})

test('collaboration entry defaults to rounded but accepts every explicit office layout', () => {
  assert.equal(collaborationEntryUrl('https://example.test/base/collaboration/?foo=1#scene').href, 'https://example.test/base/collaboration/?foo=1&shell=rounded#scene')
  for (const id of ['classic', 'members', 'rounded']) {
    assert.equal(collaborationEntryUrl(`https://example.test/collaboration/?shell=${id}`).searchParams.get('shell'), id)
    assert.equal(resolveOfficeShell(`?shell=${id}`), id)
  }
  assert.equal(collaborationEntryUrl('https://example.test/collaboration/?shell=unknown').searchParams.get('shell'), 'rounded')
})

test('collaboration directory, map and chat persistence are isolated from the ordinary office', t => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const environment = createCollaborationEnvironment(storage)
  assert.equal(environment.presentation, 'panorama')
  storage.setItem(sceneStorageKey('one'), 'ordinary-map')
  storage.setItem('directory', 'ordinary-directory')
  environment.storage.setItem('directory', 'collaboration-directory')
  assert.equal(storage.getItem('directory'), 'ordinary-directory')
  assert.equal(environment.storage.getItem('directory'), 'collaboration-directory')
  assert.equal(environment.chatKey('preview'), 'collaboration:preview')
  const runtime = environment.createRuntime('one', true)
  t.after(() => runtime.dispose())
  assert.equal(runtime.readActors().length, 6)
  assert.equal(runtime.submit({ protocolVersion: '2.0', sceneId: 'one', commandId: 'save', type: 'actor.presentation.set', actorId: 'office-lead', sourceRevision: 1, status: 'working', title: '协作任务' }).status, 'completed')
  assert.equal(storage.getItem(sceneStorageKey('one')), 'ordinary-map')
  assert(storage.getItem(sceneStorageKey('one', 'collaboration')))
})
