import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTestServer } from './helpers/vite.mjs'

let server, ExampleOfficeDataSource, createDemoOfficeTeams, TeamSwitcher, TeamDecisionNotice
before(async () => {
  server = await createTestServer()
  ;({ ExampleOfficeDataSource } = await server.ssrLoadModule('/example/office-web/src/dashboard/demoSource.ts'))
  ;({ createDemoOfficeTeams } = await server.ssrLoadModule('/example/office-web/src/dashboard/demoTeams.ts'))
  ;({ TeamSwitcher } = await server.ssrLoadModule('/example/office-web/src/ui/TeamSwitcher.tsx'))
  ;({ TeamDecisionNotice } = await server.ssrLoadModule('/example/office-web/src/ui/team-switcher/TeamDecisionNotice.tsx'))
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

test('background decisions expose a compact action card with explicit team ownership', () => {
  const createdAt = Date.now()
  const teams = createDemoOfficeTeams(new ExampleOfficeDataSource()).map((team, index) => ({ ...team, decisionCount: index === 0 ? 1 : index === 1 ? 2 : 0,
    pendingDecision: { teamId: team.id, id: 'request-1', kind: 'confirmation', requester: { name: '负责人', appearanceId: 'office-lead' },
      title: '确认方案', description: '请核对后选择。', confirmLabel: '确认发布', rejectLabel: '暂不发布', createdAt, expiresAt: createdAt + 30000 } }))
  const html = renderToStaticMarkup(createElement(TeamSwitcher, { selection: { teams, activeId: teams[0].id, select() {}, openDecisions() {}, resolveDecision() {} } }))
  assert(html.includes('3 项待确认'))
  assert(html.includes('team-decision-count'))
  assert(html.includes('role="region" aria-label="内容运营团队待决定提示"'))
  assert(html.includes('进入内容运营团队办公室'))
  assert(html.includes('确认发布'))
  assert(html.includes('暂不发布'))
  assert(html.includes('data-actionable="true"'))
  assert(html.includes('2 项待你决定'))
  assert(html.includes('aria-label="问题剩余有效时间"'))
  assert(html.includes('aria-valuetext="30 秒"'))
  assert(!html.includes('office-decision-card'))
  assert(!html.includes('进入登录模块开发办公室'))
})

test('background choices show radio options, disabled initial submit and team-local errors', () => {
  const team = { id: 'b', name: 'B', sceneLabel: '办公室', decisionCount: 1, pendingDecision: {
    teamId: 'b', id: 'choice', kind: 'choice', title: '选择处理方式', description: '', requester: { name: '负责人', appearanceId: 'office-lead' },
    options: [{ id: 'one', label: '方案一', description: '先开发' }, { id: 'two', label: '方案二', description: '先测试' }],
  } }
  const render = value => renderToStaticMarkup(createElement(TeamDecisionNotice, { team: value, otherCount: 0, onOpen() {}, onDismiss() {}, onResolve() {} }))
  const initial = render(team)
  assert.equal((initial.match(/type="radio"/g) ?? []).length, 2)
  assert(initial.includes('方案一') && initial.includes('先开发') && initial.includes('方案二'))
  assert.match(initial, /type="submit"[^>]*disabled=""/)
  const submitting = render({ ...team, decisionSubmittingId: 'choice' })
  assert(submitting.includes('aria-busy="true"'))
  assert(submitting.includes('正在提交…'))
  assert(submitting.includes('<fieldset aria-label="处理方案" disabled=""'))
  const failed = render({ ...team, decisionError: '提交失败，请重试' })
  assert(failed.includes('role="alert">提交失败，请重试'))
  assert(!failed.includes('aria-busy="true"'))
})

test('entering a decision office prioritizes its own panel until its queue is empty', () => {
  const teams = [{ id: 'a', name: 'A', sceneLabel: '办公室', decisionCount: 1 }, { id: 'b', name: 'B', sceneLabel: '办公室', decisionCount: 1 }]
  const selection = { teams, activeId: 'a', focusedDecisionTeamId: 'a', select() {} }
  const render = value => renderToStaticMarkup(createElement(TeamSwitcher, { selection: value }))
  assert(!render(selection).includes('team-decision-notice'))
  assert(render({ ...selection, teams: [{ ...teams[0], decisionCount: 0 }, teams[1]] }).includes('team-decision-notice'))
  assert(render({ ...selection, focusedDecisionTeamId: '' }).includes('team-decision-notice'))
})
