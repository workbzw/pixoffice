import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFile, readdir } from 'node:fs/promises'
import { createTestServer } from './helpers/vite.mjs'

let server, model, TeamOverviewDialog, createTeamDirectoryStore, useOfficeTeamDirectory, TeamSwitcher
before(async () => {
  server = await createTestServer()
  model = await server.ssrLoadModule('/example/office-web/src/ui/team-switcher/model.ts')
  ;({ TeamOverviewDialog } = await server.ssrLoadModule('/example/office-web/src/ui/team-switcher/TeamOverviewDialog.tsx'))
  ;({ createTeamDirectoryStore, useOfficeTeamDirectory } = await server.ssrLoadModule('/example/office-web/src/controller/useOfficeTeamDirectory.ts'))
  ;({ TeamSwitcher } = await server.ssrLoadModule('/example/office-web/src/ui/TeamSwitcher.tsx'))
})
after(() => server?.close())

const teams = [
  { id: 'a', name: '情报团队', sceneLabel: '办公室', description: '行业与竞品', memberCount: 6, workingCount: 2, pendingCount: 1, avatarIds: ['office-lead', 'code-agent'] },
  { id: 'b', name: '内容团队', sceneLabel: '办公室', description: '文案与素材', memberCount: 5, workingCount: 1, pendingCount: 0 },
  { id: 'c', name: '分析团队', sceneLabel: '办公室', description: '数据与报告' },
]

test('the overview exposes team cards, real summaries and search without style controls', () => {
  const html = renderToStaticMarkup(createElement(TeamOverviewDialog, {
    id: 'team-dialog', selection: { teams, activeId: 'a', select() {} }, onClose() {},
  }))
  assert(html.includes('id="team-dialog"'))
  assert(html.includes('team-overview-grid'))
  assert(html.includes('aria-label="搜索团队"'))
  for (const team of teams) assert(html.includes(`进入${team.name}`))
  assert(html.includes('6 位成员'))
  assert(html.includes('2 人工作中'))
  assert(html.includes('1 项待处理'))
  assert(html.includes('site/office-scene.webp'))
  assert(!html.includes('团队切换样式'))
  assert(!html.includes('横向轮播'))
  assert(!html.includes('环形轨道'))
})

test('unselected switcher implementations and styles are removed', async () => {
  const files = await readdir(new URL('../example/office-web/src/ui/team-switcher/', import.meta.url))
  for (const old of ['TeamModePicker.tsx', 'TeamPickerDialog.tsx', 'TeamSwitcher.css']) assert(!files.includes(old))
  const css = await readFile(new URL('../example/office-web/src/ui/team-switcher/TeamOverview.css', import.meta.url), 'utf8')
  assert(!/team-(stack|carousel|orbit|mode)/.test(css))
  const trigger = css.match(/\.office-team-switcher\s*\{([^}]+)\}/)[1]
  assert.match(trigger, /left:\s*12px/)
  assert.match(trigger, /top:\s*12px/)
})

test('search matches names and descriptions while preserving team identities', () => {
  assert.deepEqual(model.filterTeams(teams, '  竞品  ').map(team => team.id), ['a'])
  assert.deepEqual(model.filterTeams(teams, '文案').map(team => team.id), ['b'])
  assert.equal(model.filterTeams(teams, '办公室').length, 3)
  assert.deepEqual(model.filterTeams(teams, '不存在'), [])
  assert.equal(model.filterTeams(teams, '')[0], teams[0])
})

test('team search focus uses only the rounded outer border', async () => {
  const css = await readFile(new URL('../example/office-web/src/ui/team-switcher/TeamOverview.css', import.meta.url), 'utf8')
  assert.match(css, /\.team-picker \.team-picker-search input:focus-visible\s*\{\s*outline:\s*none;/)
  assert.match(css, /\.team-picker-search:focus-within\s*\{\s*border-color:/)
  assert.match(css, /\.team-picker-search\s*\{[^}]*border-radius:\s*12px/)
  assert.match(css, /\.team-picker button:focus-visible\s*\{\s*outline:\s*2px/)
})

test('the overview directory observes background sessions and cleans up subscriptions', () => {
  const listeners = [new Set(), new Set()]
  const states = [{ dashboard: { workspace: { name: 'A' } } }, { dashboard: { workspace: { name: 'B' } } }]
  const sessions = states.map((_, index) => ({
    getSnapshot: () => states[index], subscribe(listener) { listeners[index].add(listener); return () => listeners[index].delete(listener) },
    runtime: { readActors: () => [], subscribe: () => () => {} },
  }))
  const store = createTeamDirectoryStore(sessions)
  const before = store.getSnapshot()
  assert.equal(store.getSnapshot(), before)
  let notifications = 0
  const unsubscribe = store.subscribe(() => { notifications++ })
  states[1] = { dashboard: { workspace: { name: 'B 最新状态' } } }
  listeners[1].forEach(listener => listener())
  const after = store.getSnapshot()
  assert.notEqual(after, before)
  assert.equal(after[0], before[0])
  assert.equal(after[1].dashboard.workspace.name, 'B 最新状态')
  assert.equal(store.getSnapshot(), after)
  assert.equal(notifications, 1)
  unsubscribe()
  assert.deepEqual(listeners.map(set => set.size), [0, 0])
})

test('the scene trigger suspends presentation without stopping the team host', async () => {
  const workspace = await readFile(new URL('../example/office-web/src/components/RuntimeWorkspace.tsx', import.meta.url), 'utf8')
  assert.match(workspace, /useOfficeSceneController\(runtime, covered \|\| teamPickerOpen, simulation, dashboard(?:,|\))/)
  assert.match(workspace, /onTeamPickerOpenChange=\{setTeamPickerOpen\}/)
  const app = await readFile(new URL('../example/office-web/src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /useOfficeTeamHost\(hostedSessions\)/)
  assert(!app.includes('teamPickerOpen'))
})

test('background notices use the first pending question deadline and advance with the queue', () => {
  const createdAt = Date.now()
  const pending = [
    { id: 'first', title: '先处理的问题', createdAt, expiresAt: createdAt + 20000 },
    { id: 'second', title: '稍后处理的问题', createdAt, expiresAt: createdAt + 50000 },
  ].map(request => ({ ...request, teamId: 'b', kind: 'confirmation', description: '', confirmLabel: '确认', rejectLabel: '拒绝', requester: { name: 'B', appearanceId: 'office-lead' } }))
  const states = teams.slice(0, 2).map(() => ({ dashboard: null }))
  const decisions = [{ pending: [] }, { pending }]
  const sessions = teams.slice(0, 2).map((team, index) => ({
    runtime: { sceneId: team.id, readActors: () => [], subscribe: () => () => {} },
    getSnapshot: () => states[index], subscribe: () => () => {},
    decisions: { getSnapshot: () => decisions[index], subscribe: () => () => {} },
  }))
  function Directory() {
    const options = useOfficeTeamDirectory(teams.slice(0, 2), sessions)
    return createElement(TeamSwitcher, { selection: { teams: options, activeId: 'a', select() {} } })
  }
  const first = renderToStaticMarkup(createElement(Directory))
  assert(first.includes('aria-label="问题剩余有效时间"'))
  assert(first.includes('aria-valuetext="20 秒"'))
  assert(!first.includes('aria-valuetext="50 秒"'))
  decisions[1] = { pending: [pending[1]] }
  const second = renderToStaticMarkup(createElement(Directory))
  assert(second.includes('aria-valuetext="50 秒"'))
})

test('the directory projects submission and failure state from the owning team only', () => {
  const sessions = teams.slice(0, 2).map(team => ({
    runtime: { sceneId: team.id, readActors: () => [], subscribe: () => () => {} },
    getSnapshot: () => ({ dashboard: null }), subscribe: () => () => {},
    decisions: { getSnapshot: () => ({ pending: [], submittingId: team.id === 'b' ? 'b-question' : undefined, error: team.id === 'b' ? 'B failed' : null }), subscribe: () => () => {} },
  }))
  let options
  function Directory() { options = useOfficeTeamDirectory(teams.slice(0, 2), sessions); return null }
  renderToStaticMarkup(createElement(Directory))
  assert.equal(options[0].decisionSubmittingId, undefined)
  assert.equal(options[0].decisionError, '')
  assert.equal(options[1].decisionSubmittingId, 'b-question')
  assert.equal(options[1].decisionError, 'B failed')
})

test('replayed questions get a fresh notice identity and notices have no separate six-second expiry', async () => {
  const pendingDecision = { id: 'question', title: '确认方案', createdAt: 1000, expiresAt: 61000 }
  const team = { ...teams[1], decisionCount: 1, pendingDecision }
  assert.equal(model.decisionNoticeKey(team), model.decisionNoticeKey({ ...team }))
  assert.notEqual(model.decisionNoticeKey(team), model.decisionNoticeKey({ ...team, pendingDecision: { ...pendingDecision, createdAt: 2000, expiresAt: 62000 } }))
  const source = await readFile(new URL('../example/office-web/src/ui/team-switcher/TeamDecisionNotice.tsx', import.meta.url), 'utf8')
  assert(!source.includes('setTimeout'))
  assert(!source.includes('6000'))
  assert.match(source, /<DecisionDeadline/)
})
