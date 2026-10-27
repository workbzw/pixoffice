import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'

let server, CivicOfficeDataSource, OfficeTeamSession, OfficeTeamHost, createCivicEnvironment, DemoOfficeDirectory, civicChatSource, timing, content, memberOverview
before(async () => {
  server = await createTestServer()
  ;({ CivicOfficeDataSource } = await server.ssrLoadModule('/example/office-web/src/civic/CivicOfficeDataSource.ts'))
  ;({ OfficeTeamSession } = await server.ssrLoadModule('/example/office-web/src/application/OfficeTeamSession.ts'))
  ;({ OfficeTeamHost } = await server.ssrLoadModule('/example/office-web/src/application/OfficeTeamHost.ts'))
  ;({ createCivicEnvironment } = await server.ssrLoadModule('/example/office-web/src/civic/environment.ts'))
  ;({ DemoOfficeDirectory } = await server.ssrLoadModule('/example/office-web/src/dashboard/demoOfficeDirectory.ts'))
  ;({ civicChatSource } = await server.ssrLoadModule('/example/office-web/src/civic/demo.ts'))
  ;({ civicDemoTiming: timing } = await server.ssrLoadModule('/example/office-web/src/civic/CivicDemoRun.ts'))
  ;({ memberOverview } = await server.ssrLoadModule('/example/office-web/src/dashboard/memberSelectors.ts'))
  content = await server.ssrLoadModule('/example/office-web/src/civic/scenario.ts')
})
after(() => server?.close())

const foreign = /电商|商品|支架|销量|投放|售价|市场分析|登录模块|代码审查|缺陷修复|前端开发|后端开发|警察/
const flush = () => new Promise(resolve => setImmediate(resolve))
function storage() {
  const data = new Map()
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
}
async function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 })
  const environment = createCivicEnvironment(storage()), scenario = environment.demo
  const teams = scenario.createTeams(scenario.createSource())
  const sessions = teams.map(team => new OfficeTeamSession(environment.createRuntime(team.id, false), team.source, { decisionPreview: true, chatSource: scenario.createChatSource() }))
  const host = new OfficeTeamHost()
  t.after(() => { host.stop(); for (const session of sessions) session.runtime.dispose() })
  host.update(sessions)
  await Promise.all(sessions.map(session => session.refresh()))
  const refresh = async () => { await Promise.all(sessions.map(session => session.refresh())); await flush() }
  const pending = () => sessions.flatMap(session => session.decisions.getSnapshot().pending.map(request => ({ session, request })))
  const choose = async choice => {
    const decision = pending()[0]; assert(decision)
    await decision.session.decisions.choose(decision.session.runtime.sceneId, decision.request.id, choice)
    await refresh()
  }
  const advance = async ms => {
    for (let remaining = ms; remaining > 0;) {
      const step = Math.min(50, remaining)
      host.advance(step); t.mock.timers.tick(step); remaining -= step
      await flush()
    }
    await refresh()
  }
  const until = async (condition, maxMs = 60000) => {
    for (let elapsed = 0; elapsed < maxMs && !condition(); elapsed += 50) await advance(50)
    assert(condition(), `civic story stalled at ${sessions[0].source.stage}`)
  }
  return { sessions, host, owner: sessions[0], refresh, pending, choose, advance, until }
}

test('civic directory, all conversations, people, charts and initial histories contain only the public-service case', async () => {
  const environment = createCivicEnvironment(storage()), scenario = environment.demo
  const directory = new DemoOfficeDirectory(scenario.createSource(), environment.storage, scenario)
  assert.deepEqual(directory.list().map(team => team.name), ['公务综合协调组', '公务现场保障组', '公务材料复核组'])
  for (const team of directory.list()) {
    assert(team.source instanceof CivicOfficeDataSource)
    assert.equal(team.sceneLabel, '公务')
    assert.equal(team.source.replayEvents, false)
    assert.equal(team.source.canExecute, false)
    const data = await team.source.getSnapshot()
    assert.equal(data.employees.length, 6)
    assert(data.tasks.every(task => task.status === 'queued' && task.progress === 0))
    assert(data.employees.every(employee => memberOverview(data, employee.id).events.some(event => /待命/.test(event.summary))))
    const chat = civicChatSource(team.source)
    assert.equal(chat.historyKey, 'civic-service-demo-v1')
    for (const conversation of team.source.getConversations()) {
      assert.doesNotMatch(JSON.stringify(conversation), foreign)
      assert.match(conversation.whiteboard.title, /便民服务/)
      assert.equal(conversation.whiteboard.status, 'queued')
      assert(chat.initialHistory(conversation.id, team.id).length >= 2)
      assert.doesNotMatch(JSON.stringify(chat.initialHistory(conversation.id, team.id)), foreign)
      for (const employee of conversation.employees) {
        assert(employee.insights.periods.every(period => period.metrics.some(metric => metric.label === '待补材料')))
        assert.doesNotMatch(JSON.stringify(employee.insights), foreign)
      }
    }
  }
  const added = await directory.create({ name: '公务专项服务组' })
  assert(added.source instanceof CivicOfficeDataSource)
  assert.equal((await added.source.getSnapshot()).workspace.name, '公务专项服务组')
  assert.doesNotMatch(JSON.stringify(await added.source.getSnapshot()), foreign)
  const restored = new DemoOfficeDirectory(scenario.createSource(), environment.storage, scenario)
  assert(restored.list().at(-1).source instanceof CivicOfficeDataSource)
})

test('civic handoffs gate work, two decisions guide the story, and all progress ends with honest follow-up results', async t => {
  const f = await setup(t)
  const startedAt = Date.now()
  assert.equal(f.owner.simulation.scenarioLabel, '公务保障')
  assert.equal(f.owner.chat.source.historyKey, 'civic-service-demo-v1')
  f.owner.simulation.setDemo(true)
  await f.advance(50)
  assert.equal(f.owner.source.stage, 'dispatching')
  assert(f.owner.getSnapshot().dashboard.tasks.filter(task => task.assigneeId !== 'office-lead').every(task => task.status === 'queued'))
  assert(f.owner.runtime.readActors().filter(actor => actor.id !== 'office-lead').every(actor => actor.presentation.status !== 'working'))
  await f.until(() => f.pending().length === 1)
  assert.equal(f.owner.source.stage, 'approval')
  assert.equal(f.pending()[0].session, f.owner)
  assert.match(f.pending()[0].request.title, /启动便民服务保障/)
  await f.advance(5000)
  assert.equal(f.owner.source.stage, 'approval')
  assert(!f.owner.getSnapshot().dashboard.tasks.some(task => task.id === 'service-live'))
  await f.choose('confirm')
  assert.equal(f.owner.source.stage, 'serving')
  await f.advance(timing.serviceMs)
  assert.equal(f.owner.source.stage, 'decision')
  assert.notEqual(f.pending()[0].session, f.owner)
  assert.deepEqual(f.pending()[0].request.options.map(option => option.id), ['guidance', 'appointments', 'hold'])
  await f.choose('guidance')
  assert.equal(f.owner.source.stage, 'adjusting')
  assert.equal(f.owner.getSnapshot().dashboard.tasks.find(task => task.id === 'service-followup').status, 'queued')
  await f.until(() => f.owner.getSnapshot().dashboard.tasks.find(task => task.id === 'service-followup').status === 'running')
  await f.until(() => f.owner.source.stage === 'checking')
  assert.equal(f.owner.getSnapshot().dashboard.tasks.find(task => task.id === 'service-check').status, 'running')
  await f.until(() => f.owner.source.stage === 'archiving')
  assert.equal(f.owner.getSnapshot().dashboard.tasks.find(task => task.id === 'service-check').status, 'completed')
  assert.equal(f.owner.getSnapshot().dashboard.tasks.find(task => task.id === 'service-archive').status, 'running')
  await f.until(() => f.owner.source.stage === 'completed')
  assert(Date.now() - startedAt > 30000 && Date.now() - startedAt < 80000)
  for (const session of f.sessions) {
    const data = session.getSnapshot().dashboard
    assert.equal(data.whiteboard.status, 'completed')
    assert(data.whiteboard.steps.every(step => step.progress === 100))
    assert(data.tasks.every(task => task.status === 'completed' && task.progress === 100))
    assert.match(data.whiteboard.description, /11 项已完成，1 项待补材料/)
    assert.doesNotMatch(JSON.stringify(data), foreign)
    for (const employee of data.employees) {
      const events = memberOverview(data, employee.id).events
      assert(events.some(event => event.kind === 'task.started'))
      assert(events.some(event => event.kind === 'task.completed'))
      if (employee.id !== 'office-lead') assert(events.some(event => event.kind === 'task.assigned'))
    }
    const transcript = session.chat.selected.getSnapshot().messages.map(message => message.content).join('\n')
    assert.match(transcript, /1 项待补材料事项仍保留待办/)
    assert.doesNotMatch(transcript, foreign)
    assert.equal(session.decisions.getSnapshot().pending.length, 0)
    assert(session.runtime.snapshot().records.filter(record => record.command.capability === 'office.visit').every(record => record.status === 'completed' && !record.error))
  }
  assert.equal(f.owner.simulation.isDemoRunning, false)
  assert.equal(f.sessions.reduce((count, session) => count + session.decisions.getSnapshot().records.length, 0), 2)
})

test('rejected and expired civic approvals never manufacture on-site results', async t => {
  const f = await setup(t)
  f.owner.simulation.setDemo(true); await f.until(() => f.pending().length === 1)
  await f.choose('reject'); await f.advance(120000)
  assert.equal(f.owner.source.stage, 'rejected')
  assert.equal(f.pending().length, 0)
  assert(!f.owner.getSnapshot().dashboard.tasks.some(task => task.id === 'service-live'))
  f.owner.simulation.setDemo(true); await f.until(() => f.pending().length === 1)
  await f.advance(timing.decisionTimeoutMs)
  assert.equal(f.owner.source.stage, 'expired')
  assert.equal(f.pending().length, 0)
  assert(!f.owner.getSnapshot().dashboard.tasks.some(task => task.id === 'service-live'))
})

test('appointments and holding have distinct outcomes; holding retains the first-round facts', async t => {
  const f = await setup(t)
  f.owner.simulation.setDemo(true); await f.until(() => f.pending().length === 1); await f.choose('confirm'); await f.advance(timing.serviceMs)
  await f.choose('appointments'); await f.until(() => f.owner.source.stage === 'completed')
  assert.match(f.owner.getSnapshot().dashboard.whiteboard.description, /10 项已完成，2 项待补材料/)
  f.owner.simulation.setDemo(true); await f.until(() => f.pending().length === 1); await f.choose('confirm'); await f.advance(timing.serviceMs)
  await f.choose('hold'); await f.advance(120000)
  assert.equal(f.owner.source.stage, 'paused')
  assert.equal(f.pending().length, 0)
  const reply = f.owner.source.reply({ messages: [{ content: '复盘数据' }] })
  assert.match(reply, /\| 已完成事项 \| 8 项 \|/)
  assert.doesNotMatch(reply, /11 项|10 项/)
})

test('materials stay isolated, stop preserves real progress, and replay retains drafts without duplicate scripted chat', async t => {
  const f = await setup(t)
  const source = f.owner.source
  f.owner.chat.select('service-materials'); await f.refresh()
  const materials = await source.getSnapshot()
  source.applyStage('decision')
  assert.deepEqual((await source.getSnapshot()).whiteboard, materials.whiteboard)
  f.owner.chat.select('main'); await f.refresh()
  f.owner.chat.selected.setDraft('保留值守安排备注')
  f.owner.simulation.setDemo(true); await f.advance(500)
  f.owner.simulation.setDemo(false); await f.advance(120000)
  assert.equal(source.stage, 'stopped')
  assert(!f.owner.getSnapshot().dashboard.tasks.some(task => task.status === 'completed'))
  assert.equal(f.pending().length, 0)
  f.owner.simulation.setDemo(true); await f.until(() => f.pending().length === 1)
  assert.equal(f.owner.chat.selected.getSnapshot().draft, '保留值守安排备注')
  assert.equal(f.owner.chat.selected.getSnapshot().messages.filter(message => message.id === 'civic-demo:approval:assistant').length, 1)
  await f.owner.chat.remove('main'); await f.advance(1000)
  assert.equal(source.stage, 'stopped')
  assert.equal(f.pending().length, 0)
})

test('civic state changes do not duplicate activity entries, and replies remain civic throughout', async () => {
  const source = new CivicOfficeDataSource('coordination')
  source.beginDispatch(); source.acceptAssignment('code-agent')
  const before = await source.getSnapshot()
  source.acceptAssignment('code-agent'); source.applyStage('dispatching')
  assert.deepEqual((await source.getSnapshot()).events, before.events)
  for (const stage of ['ready', 'dispatching', 'preparing', 'approval', 'serving', 'decision', 'adjusting', 'checking', 'archiving', 'completed', 'paused', 'rejected', 'expired', 'stopped']) {
    source.applyStage(stage)
    assert.doesNotMatch(JSON.stringify(source.getConversations()), foreign)
    for (const content of ['现在的任务是什么', '服务材料有哪些', '办结数据怎么样', '价格多少']) assert.doesNotMatch(source.reply({ messages: [{ content }] }), foreign)
  }
})
