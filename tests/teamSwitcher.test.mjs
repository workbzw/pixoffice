import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTestServer } from './helpers/vite.mjs'

let server, ExampleOfficeDataSource, createDemoOfficeTeams, TeamSwitcher
before(async () => {
  server = await createTestServer()
  ;({ ExampleOfficeDataSource } = await server.ssrLoadModule('/example/office-web/src/dashboard/demoSource.ts'))
  ;({ createDemoOfficeTeams } = await server.ssrLoadModule('/example/office-web/src/dashboard/demoTeams.ts'))
  ;({ TeamSwitcher } = await server.ssrLoadModule('/example/office-web/src/ui/TeamSwitcher.tsx'))
})
after(() => server?.close())

test('local demo teams have independent workspaces, roles and task actions', async () => {
  const source = new ExampleOfficeDataSource()
  const teams = createDemoOfficeTeams(source)
  assert.equal(teams.length, 3)
  assert.equal(new Set(teams.map(team => team.id)).size, 3)
  assert.equal(teams[0].source, source)
  const snapshots = await Promise.all(teams.map(team => team.source.getSnapshot()))
  assert.deepEqual(snapshots.map(snapshot => snapshot.workspace.id), teams.map(team => team.id))
  assert.equal(snapshots[1].employees.find(employee => employee.id === 'app-agent').role, '内容撰写')
  assert.equal(snapshots[2].employees.find(employee => employee.id === 'review-agent').role, '经营分析')
  await teams[1].source.execute({ type: 'task.complete', taskId: 'article' })
  assert.equal((await teams[1].source.getSnapshot()).tasks.find(task => task.id === 'article').status, 'completed')
  assert.deepEqual(await teams[0].source.getSnapshot(), snapshots[0])
  assert.deepEqual(await teams[2].source.getSnapshot(), snapshots[2])
  await assert.rejects(teams[2].source.execute({ type: 'task.complete', taskId: 'article' }), /任务不存在/)
})

test('remote data sources do not acquire local example teams', () => {
  assert.deepEqual(createDemoOfficeTeams({ kind: 'http' }), [])
})

test('team switcher is controlled by its host and does not expose a picker for one team', () => {
  const teams = createDemoOfficeTeams(new ExampleOfficeDataSource())
  const selection = { teams, activeId: teams[1].id, select() {} }
  const multiple = renderToStaticMarkup(createElement(TeamSwitcher, { selection, fallbackName: 'fallback' }))
  assert.match(multiple, /aria-label="团队空间，当前团队：内容运营团队"/)
  assert.match(multiple, /aria-expanded="false"/)
  assert(!multiple.includes('runtime-current-team'))
  assert(!multiple.includes('团队切换样式'))
  const single = renderToStaticMarkup(createElement(TeamSwitcher, { selection: { ...selection, teams: [teams[1]] }, fallbackName: 'fallback' }))
  assert.match(single, /disabled=""/)
  assert(!single.includes('aria-expanded'))
  const fallback = renderToStaticMarkup(createElement(TeamSwitcher, { fallbackName: '远程业务团队' }))
  assert.match(fallback, /远程业务团队/)
  assert(!fallback.includes('情报监测团队'))
})

test('the team entry lives inside the office scene instead of the sidebar', async () => {
  const shell = await readFile(new URL('../example/office-web/src/ui/OfficeShell.tsx', import.meta.url), 'utf8')
  assert(!shell.includes('TeamSwitcher'))
  assert(!shell.includes('runtime-workspace-name'))
  const controls = await readFile(new URL('../example/office-web/src/ui/OfficeSceneControls.tsx', import.meta.url), 'utf8')
  assert.match(controls, /!editor && <TeamSwitcher/)
  const workspace = await readFile(new URL('../example/office-web/src/components/RuntimeWorkspace.tsx', import.meta.url), 'utf8')
  assert(workspace.indexOf('<OfficeCanvas') < workspace.indexOf('<OfficeSceneControls'))
  assert.match(workspace, /teamSelection=\{teamSelection\}/)
})

test('all team sessions are hosted independently of the active view', async () => {
  const app = await readFile(new URL('../example/office-web/src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /const activeSession = sessions\.get\(activeId\)/)
  assert.match(app, /useOfficeTeamHost\(hostedSessions\)/)
  assert.match(app, /teams\.length \? teams :/)
  assert(!app.includes('setActiveSimulation'))
  assert(!app.includes('setActiveRuntime'))
})

test('background decisions show a badge and light notice, never a foreign action card', () => {
  const createdAt = Date.now()
  const teams = createDemoOfficeTeams(new ExampleOfficeDataSource()).map((team, index) => ({ ...team, decisionCount: index === 0 ? 1 : index === 1 ? 2 : 0,
    pendingDecision: { id: 'request-1', title: '确认方案', createdAt, expiresAt: createdAt + 30000 } }))
  const html = renderToStaticMarkup(createElement(TeamSwitcher, { selection: { teams, activeId: teams[0].id, select() {}, openDecisions() {} } }))
  assert(html.includes('3 项待确认'))
  assert(html.includes('team-decision-count'))
  assert(html.includes('前往处理内容运营团队的确认请求'))
  assert(html.includes('2 项待你决定'))
  assert(html.includes('aria-label="问题剩余有效时间"'))
  assert(html.includes('aria-valuetext="30 秒"'))
  assert(!html.includes('office-decision-card'))
  assert(!html.includes('前往处理登录模块开发的确认请求'))
})
