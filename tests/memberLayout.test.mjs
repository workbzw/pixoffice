import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTestServer } from './helpers/vite.mjs'

let server, selectors, layout, MemberOfficeShell
before(async () => {
  server = await createTestServer()
  selectors = await server.ssrLoadModule('/example/office-web/src/dashboard/memberSelectors.ts')
  layout = await server.ssrLoadModule('/example/office-web/src/ui/officeLayout.ts')
  ;({ MemberOfficeShell } = await server.ssrLoadModule('/example/office-web/src/ui/MemberOfficeShell.tsx'))
})
after(async () => { await server?.close() })

const at = '2026-10-23T10:00:00Z'
const snapshot = {
  schemaVersion: '1.0', conversationId: 'session-a', workspace: { id: 'office-a', name: '研发办公室' },
  employees: [
    { id: 'alice', sceneActorId: 'shared-actor', name: '甲', role: '开发', online: true },
    { id: 'bob', sceneActorId: 'shared-actor', name: '乙', role: '评审', online: false },
  ],
  tasks: [
    { id: 'done', title: '完成任务', assigneeId: 'alice', status: 'completed', progress: 10, updatedAt: at },
    { id: 'waiting', title: '等待任务', assigneeId: 'alice', status: 'queued', progress: -1, updatedAt: at },
    { id: 'active', title: '开发任务', assigneeId: 'alice', status: 'running', progress: 42, updatedAt: at },
    { id: 'other', title: '其他成员任务', assigneeId: 'bob', status: 'running', progress: 55, updatedAt: at },
  ],
  events: [
    { id: 'older', kind: 'note', employeeId: 'alice', summary: '较早动态', occurredAt: '2026-10-22T09:00:00Z' },
    { id: 'unrelated', kind: 'note', employeeId: 'bob', summary: '不应混入', occurredAt: at },
    { id: 'task-only', kind: 'note', taskId: 'active', summary: '任务更新', occurredAt: at },
  ],
}

test('member summary uses only assigned tasks in the supplied conversation and never mutates the snapshot', () => {
  const original = structuredClone(snapshot)
  const overview = selectors.memberOverview(snapshot, 'alice')
  assert.equal(overview.total, 3)
  assert.equal(overview.running, 1)
  assert.equal(overview.completed, 1)
  assert.equal(overview.currentTask.id, 'active')
  assert.deepEqual(overview.events.map(event => event.id), ['task-only', 'older'])
  assert.deepEqual(snapshot, original)
  const empty = selectors.memberOverview({ ...snapshot, tasks: [], events: [] }, 'alice')
  assert.equal(empty.total, 0)
  assert.equal(empty.currentTask, undefined)
})

test('employees sharing one character retain independent identities and the current selection', () => {
  assert.equal(selectors.employeeForActor(snapshot, 'shared-actor').id, 'alice')
  assert.equal(selectors.employeeForActor(snapshot, 'shared-actor', 'bob').id, 'bob')
  assert.equal(selectors.employeeForActor(snapshot, 'unknown'), undefined)
})

test('member progress only reaches 100 for completed tasks', () => {
  assert.equal(selectors.memberProgress(snapshot.tasks[0]), 100)
  assert.equal(selectors.memberProgress(snapshot.tasks[1]), 0)
  assert.equal(selectors.memberProgress({ ...snapshot.tasks[2], progress: 100 }), 99)
  assert.equal(selectors.memberProgress(snapshot.tasks[2]), 42)
})

test('page shell selection is separate from scene-only layout and handles unknown preferences', () => {
  assert.equal(layout.resolveOfficeShell(''), 'classic')
  assert.equal(layout.resolveOfficeShell('?shell=members'), 'members')
  assert.equal(layout.resolveOfficeShell('?shell=classic', 'members'), 'classic')
  assert.equal(layout.resolveOfficeShell('?layout=scene', 'members'), 'members')
  assert.equal(layout.resolveOfficeShell('?shell=invalid', 'members'), 'classic')
})

function renderMemberShell(props = {}) {
  return renderToStaticMarkup(createElement(MemberOfficeShell, {
    dashboard: snapshot, appearanceIds: { 'shared-actor': 'existing-portrait' }, selectedEmployeeId: 'alice',
    scene: createElement('div', { id: 'existing-office-scene' }), connection: 'connected', dataMode: 'push',
    dashboardError: '', sceneLinkError: '', actionError: '', executeAction: async () => {}, pendingTaskIds: [],
    editing: false, canRecoverLayout: false, recoverLayout() {}, exportCapabilities() {}, exportSnapshot() {}, renderScenePanel: () => undefined,
    ...props,
  }))
}

test('member shell renders the selected employee, real task statistics and the reusable scene slot', () => {
  const html = renderMemberShell()
  assert.match(html, /id="existing-office-scene"/)
  assert.match(html, /aria-label="查看甲的资料" aria-pressed="true"/)
  assert.match(html, /aria-label="查看乙的资料" aria-pressed="false"/)
  assert.match(html, /当前会话任务统计/)
  assert.match(html, /开发任务/)
  assert.doesNotMatch(html, /不应混入|今日产出|本周完成/)
})

test('member profile shows the role under the name and status only as a dot', () => {
  const html = renderMemberShell()
  const heading = html.match(/<header class="member-profile-heading">([\s\S]*?)<\/header>/)?.[1] ?? ''
  assert.match(heading, /<span class="member-profile-role" title="开发">开发<\/span>/)
  assert.match(heading, /class="member-presence online" role="img" aria-label="在线"/)
  assert.doesNotMatch(heading, />在线<|>离线<|>状态未知</)
  assert.doesNotMatch(html, /class="member-role"|class="member-online-label"/)

  const offline = renderMemberShell({ selectedEmployeeId: 'bob' })
  const offlineHeading = offline.match(/<header class="member-profile-heading">([\s\S]*?)<\/header>/)?.[1] ?? ''
  assert.match(offlineHeading, /class="member-presence " role="img" aria-label="离线"/)
  assert.match(offlineHeading, /class="member-profile-role" title="评审">评审<\/span>/)
})

test('member roster and details have a decorative divider with compact spacing', async () => {
  const html = renderMemberShell()
  assert.match(html, /<\/section><hr class="member-roster-divider" aria-hidden="true"\/><section class="member-detail"/)
  const css = await readFile(new URL('../example/office-web/src/ui/MemberOfficeShell.css', import.meta.url), 'utf8')
  const rule = css.match(/\.member-roster-divider \{([^}]+)\}/)?.[1] ?? ''
  assert.match(rule, /flex: 0 0 1px/)
  assert.match(rule, /margin: calc\(8px - var\(--member-section-gap\)\) 0/)
  assert.match(rule, /background: #dfe7e3/)
})

test('member roster has a compact add button immediately after its title and count', async () => {
  const html = renderMemberShell({ createEmployee: async () => {}, memberActors: [{ id: 'shared-actor', name: '王明' }] })
  assert.match(html, /class="member-roster-heading"><h2[^>]*>团队成员 <span>（2）<\/span><\/h2><button class="member-add-button" type="button" title="添加成员" aria-label="添加成员"><svg/)
  assert.match(renderMemberShell(), /aria-label="添加成员" disabled=""/)
  const css = await readFile(new URL('../example/office-web/src/ui/MemberOfficeShell.css', import.meta.url), 'utf8')
  const rule = css.match(/\.member-add-button \{([^}]+)\}/)?.[1] ?? ''
  assert.match(rule, /width: 22px; height: 22px/)
  assert.match(rule, /border: 0/)
  assert.match(rule, /background: transparent/)
})

test('member add button stays visible but disabled at six members with an explicit capacity tooltip', () => {
  const employees = Array.from({ length: 6 }, (_, index) => ({ id: `member-${index}`, name: `成员${index}` }))
  const html = renderMemberShell({ dashboard: { ...snapshot, employees, tasks: [], events: [] }, createEmployee: async () => {}, memberActors: [{ id: 'free', name: '空闲人物' }] })
  assert.match(html, /title="办公室已满，最多 6 位成员" aria-label="添加成员" disabled=""/)
  const anotherConversation = renderMemberShell({ createEmployee: async () => {}, memberActors: [], memberCreationBlockReason: '办公室已满，最多 6 位成员' })
  assert.match(anotherConversation, /title="办公室已满，最多 6 位成员" aria-label="添加成员" disabled=""/)
})

test('task details scroll separately from the member summary and archive footer', () => {
  const description = '这段任务简介需要随任务内容滚动。'.repeat(30)
  const html = renderMemberShell({ dashboard: { ...snapshot,
    tasks: snapshot.tasks.map(task => task.id === 'active' ? { ...task, summary: description } : task) } })
  const start = html.indexOf('class="member-detail-scroll"')
  const end = html.indexOf('<footer class="member-detail-footer"')
  assert(start > 0 && end > start)
  const body = html.slice(start, end)
  assert.match(body, /role="region" aria-label="当前任务与最近动态" tabindex="0"/)
  assert.match(body, /当前任务/)
  assert.match(body, /最近动态/)
  assert(body.includes(description))
  assert(!html.slice(0, start).includes(description))
  assert(!body.includes('查看完整档案'))
  assert.match(body, /<\/div>$/)
  assert(html.slice(end).includes('查看完整档案'))
})

test('member header provides one office-entry slot beside the layout control without a duplicate office dropdown', () => {
  const html = renderMemberShell({ layoutControl: createElement('button', { 'aria-label': '切换页面布局' }) })
  const header = html.match(/<header class="member-brand-row">([\s\S]*?)<\/header>/)?.[1] ?? ''
  assert.match(header, /aria-label="切换页面布局"/)
  assert.match(header, /class="member-office-control"/)
  assert.doesNotMatch(html, /member-office-picker|aria-label="选择办公室"/)
})

test('member office entry matches the borderless layout button styling', async () => {
  const css = await readFile(new URL('../example/office-web/src/ui/MemberOfficeShell.css', import.meta.url), 'utf8')
  const layoutCss = await readFile(new URL('../example/office-web/src/ui/OfficeLayoutSwitch.css', import.meta.url), 'utf8')
  const officeRule = css.match(/\.member-office-control \.team-space-trigger \{([^}]+)\}/)?.[1] ?? ''
  const layoutRule = layoutCss.match(/\.office-layout-trigger \{([^}]+)\}/)?.[1] ?? ''
  for (const property of ['width: 34px', 'height: 34px', 'padding: 0', 'border: 0', 'border-radius: 6px', 'background: transparent', 'color: #61716a']) {
    assert(officeRule.includes(property), `office button missing ${property}`)
    assert(layoutRule.includes(property), `layout button missing ${property}`)
  }
})

test('external actor selection does not dispatch animation or business commands', async () => {
  const { SceneView } = await server.ssrLoadModule('/packages/renderer-pixi/src/SceneView.ts')
  let refreshed = 0
  const view = { runtime: { readActors: () => [{ id: 'actor-a' }] }, refresh() { refreshed++ } }
  SceneView.prototype.selectActor.call(view, 'actor-a')
  assert.equal(view.selectedActorId, 'actor-a')
  SceneView.prototype.selectActor.call(view, 'missing')
  assert.equal(view.selectedActorId, undefined)
  assert.equal(refreshed, 2)
})

test('member roster uses proportionate portraits above centered names without squeezing short viewports', async () => {
  const css = await readFile(new URL('../example/office-web/src/ui/MemberOfficeShell.css', import.meta.url), 'utf8')
  const rule = css.match(/\.member-roster-person \{([^}]+)\}/)?.[1] ?? ''
  const grid = css.match(/\.member-roster-grid \{([^}]+)\}/)?.[1] ?? ''
  const portrait = css.match(/\.member-portrait \{([^}]+)\}/)?.[1] ?? ''
  const name = css.match(/\.member-roster-person > strong \{([^}]+)\}/)?.[1] ?? ''
  assert.match(rule, /height: 78px/)
  assert.match(rule, /flex-direction: column/)
  assert.match(rule, /align-items: center/)
  assert.match(grid, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/)
  assert.match(grid, /grid-auto-rows: 78px/)
  assert.match(grid, /max-height: min\(168px, 30dvh\)/)
  assert.match(grid, /overflow-y: auto/)
  assert.match(portrait, /width: 46px; height: 46px/)
  assert.match(portrait, /flex: 0 0 46px/)
  assert.match(name, /font-size: 13px; line-height: 18px/)
  assert.match(name, /text-align: center/)
  assert.match(renderMemberShell(), /class="member-portrait"><span class="runtime-avatar" style="position:relative;width:46px;height:46px;flex-shrink:0"/)
  assert.doesNotMatch(css, /min-height: (98|108)px/)
  assert.match(css, /@media \(max-height: 740px\)/)
})
