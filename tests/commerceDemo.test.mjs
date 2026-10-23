import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'

let server, CommerceOfficeDataSource, OfficeTeamSession, OfficeTeamHost, createOfficeRuntime, PreviewChatSource, createOfficeDataSource, createDemoOfficeTeams, memberOverview, content, timing
before(async () => {
  server = await createTestServer()
  ;({ CommerceOfficeDataSource } = await server.ssrLoadModule('/example/office-web/src/dashboard/CommerceOfficeDataSource.ts'))
  ;({ OfficeTeamSession } = await server.ssrLoadModule('/example/office-web/src/application/OfficeTeamSession.ts'))
  ;({ OfficeTeamHost } = await server.ssrLoadModule('/example/office-web/src/application/OfficeTeamHost.ts'))
  ;({ createOfficeRuntime } = await server.ssrLoadModule('/example/office-web/src/application/createOfficeRuntime.ts'))
  ;({ PreviewChatSource } = await server.ssrLoadModule('/example/office-web/src/chat/sources.ts'))
  ;({ createOfficeDataSource } = await server.ssrLoadModule('/example/office-web/src/dashboard/createSource.ts'))
  ;({ createDemoOfficeTeams } = await server.ssrLoadModule('/example/office-web/src/dashboard/demoTeams.ts'))
  ;({ memberOverview } = await server.ssrLoadModule('/example/office-web/src/dashboard/memberSelectors.ts'))
  content = await server.ssrLoadModule('/example/office-web/src/dashboard/commerceScenario.ts')
  ;({ commerceDemoTiming: timing } = await server.ssrLoadModule('/example/office-web/src/application/CommerceDemoRun.ts'))
})
after(() => server?.close())

const retired = /登录模块|登录接口|登录页面|前端开发|后端开发|安全审查|接口联调|测试环境|本周项目周报/
const flush = () => new Promise(resolve => setImmediate(resolve))

async function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 })
  const sessions = Object.keys(content.commerceTeams).map(team => {
    const source = new CommerceOfficeDataSource(team)
    const runtime = createOfficeRuntime({ sceneId: content.commerceTeams[team].id, referenceLayout: true })
    return new OfficeTeamSession(runtime, source, { decisionPreview: true, chatSource: new PreviewChatSource() })
  })
  const host = new OfficeTeamHost()
  t.after(() => { host.stop(); for (const session of sessions) { session.runtime.dispose() } })
  host.update(sessions)
  await Promise.all(sessions.map(session => session.refresh()))
  const refresh = async () => { await Promise.all(sessions.map(session => session.refresh())); await flush() }
  const pending = () => sessions.flatMap(session => session.decisions.getSnapshot().pending.map(request => ({ session, request })))
  const choose = async choice => {
    const decision = pending()[0]; assert(decision, 'expected a pending decision')
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
    assert(condition(), `scenario did not reach expected state: ${sessions[0].source.stage}`)
  }
  return { host, sessions, owner: sessions[0], pending, choose, refresh, advance, until }
}

test('all three default demo offices, every conversation, role, task, board and initial chat use the same commerce case', async () => {
  const source = createOfficeDataSource()
  assert(source instanceof CommerceOfficeDataSource)
  const teams = createDemoOfficeTeams(source)
  assert.deepEqual(teams.map(team => team.name), ['电商运营团队', '商品视觉团队', '经营分析团队'])
  const chat = new PreviewChatSource()
  assert.equal(chat.historyKey, 'commerce-demo-v1', 'old programming preview archives must not leak into the commerce demo')
  for (const team of teams) {
    assert.equal(team.source.canExecute, false, 'the script owns task transitions; business decisions remain interactive')
    const data = await team.source.getSnapshot()
    assert.equal(data.employees.length, 6)
    assert(data.tasks.every(task => task.status === 'queued'))
    assert.equal(data.whiteboard.status, 'queued')
    assert.deepEqual(team.source.getConversations().map(item => item.title), ['电脑支架上架与优化', '商品素材与参数', '经营复盘'])
    assert.deepEqual(data.whiteboard.steps.map(step => step.title), ['商品与上架', '销量与反馈', '优化与复盘'])
    for (const conversation of team.source.getConversations()) {
      assert.doesNotMatch(JSON.stringify(conversation), retired)
      assert.match(conversation.whiteboard.title, /电脑支架/)
      const history = chat.initialHistory(conversation.id, team.id)
      assert(history.length >= 2)
      assert.doesNotMatch(JSON.stringify(history), retired)
    }
  }
})

test('the complete story includes physical handoffs and finishes around one minute with two user choices', async t => {
  const f = await setup(t)
  const startedAt = Date.now()
  assert.equal(timing.decisionTimeoutMs, 60000)
  f.owner.simulation.setDemo(true)
  await f.advance(15000); assert.equal(f.pending().length, 0, 'walking is not bypassed to meet a fixed approval timer')
  await f.until(() => f.pending().length === 1)
  assert.equal(f.pending().length, 1)
  assert.equal(f.pending()[0].session, f.owner)
  assert.match(f.pending()[0].request.title, /79 元上架电脑支架/)
  assert.equal(f.owner.source.stage, 'approval')
  assert.equal(f.owner.getSnapshot().dashboard.whiteboard.steps[0].progress, 95)
  await f.advance(5000)
  assert.equal(f.pending().length, 1, 'no sales observation or second question before permission')
  await f.choose('confirm')
  assert.equal(f.owner.source.stage, 'observing')
  await f.advance(timing.firstObservationMs - 1); assert.equal(f.pending().length, 0)
  await f.advance(1)
  assert.equal(f.pending().length, 1)
  assert.notEqual(f.pending()[0].session, f.owner)
  assert.equal(f.pending()[0].request.kind, 'choice')
  assert.deepEqual(f.pending()[0].request.options.map(option => option.id), ['information', 'coupon', 'pause'])
  await f.advance(5000)
  assert.equal(f.owner.source.stage, 'decision', 'strategy selection must not be automatic')
  await f.choose('information')
  assert.equal(f.owner.source.stage, 'optimizing')
  assert(f.owner.getSnapshot().dashboard.tasks.some(task => task.id === 'product-improvement' && task.status === 'queued'))
  await f.until(() => f.owner.getSnapshot().dashboard.tasks.some(task => task.id === 'product-improvement' && task.status === 'running'))
  assert.equal(f.owner.getSnapshot().dashboard.tasks.find(task => task.id === 'update-review').status, 'queued')
  await f.until(() => f.owner.source.stage === 'reviewing')
  assert.equal(f.owner.getSnapshot().dashboard.tasks.find(task => task.id === 'product-improvement').status, 'completed')
  assert.equal(f.owner.getSnapshot().dashboard.tasks.find(task => task.id === 'update-review').status, 'running')
  await f.until(() => f.owner.source.stage === 'updated')
  assert.equal(f.owner.source.getConversations()[0].title, '电脑支架上架与优化', 'whiteboard stages must not rename the conversation')
  await f.advance(timing.secondObservationMs - 1); assert.equal(f.owner.source.stage, 'updated')
  await f.advance(1)
  assert(Date.now() - startedAt >= 50000 && Date.now() - startedAt <= 75000, `full walkthrough took ${Date.now() - startedAt} ms`)
  for (const session of f.sessions) {
    assert.equal(session.source.stage, 'completed')
    assert.equal(session.getSnapshot().dashboard.whiteboard.status, 'completed')
    assert.match(session.getSnapshot().dashboard.whiteboard.description, /订单 9 → 14 单.*2\.5% → 4\.0%/)
    assert.match(session.getSnapshot().dashboard.whiteboard.note, /711 → 1,106/)
    assert(session.getSnapshot().dashboard.tasks.every(task => task.status === 'completed' && task.progress === 100))
    assert.doesNotMatch(JSON.stringify(session.getSnapshot().dashboard), retired)
    const transcript = session.chat.selected.getSnapshot().messages.map(message => message.content).join('\n')
    assert.match(transcript, /1,106|1106/)
    assert.match(transcript, /4\.0%/)
    assert.match(transcript, /不是随机对照实验/)
    assert.doesNotMatch(transcript, retired)
    assert.equal(session.decisions.getSnapshot().pending.length, 0)
  }
  assert.equal(f.owner.simulation.isDemoRunning, false)
  assert.equal(f.sessions.reduce((sum, session) => sum + session.decisions.getSnapshot().records.length, 0), 2)
})

test('rejecting listing leaves the item unpublished and never manufactures sales or a strategy request', async t => {
  const f = await setup(t)
  f.owner.simulation.setDemo(true); await f.until(() => f.pending().length === 1)
  await f.choose('reject'); await f.advance(120000)
  assert.equal(f.owner.source.stage, 'rejected')
  assert.equal(f.pending().length, 0)
  assert.equal(f.owner.simulation.isDemoRunning, false)
  assert(f.owner.getSnapshot().dashboard.tasks.filter(task => task.id.startsWith('product-')).every(task => task.status === 'completed'))
  const transcript = f.owner.chat.selected.getSnapshot().messages.map(message => message.content).join('\n')
  assert.match(transcript, /暂缓上架/)
  assert.doesNotMatch(transcript, /\| 订单 \||首轮经营观察|14 单/)
})

test('expired approval closes the flow without assuming consent', async t => {
  const f = await setup(t)
  f.owner.simulation.setDemo(true); await f.until(() => f.pending().length === 1); await f.advance(60000)
  assert.equal(f.owner.source.stage, 'expired')
  assert.equal(f.pending().length, 0)
  assert.equal(f.owner.simulation.isDemoRunning, false)
  await f.advance(120000)
  assert.equal(f.owner.source.stage, 'expired')
})

test('coupon and pause choices have different consequences instead of sharing a canned successful ending', async t => {
  const f = await setup(t)
  f.owner.simulation.setDemo(true); await f.until(() => f.pending().length === 1); await f.choose('confirm'); await f.advance(timing.firstObservationMs)
  await f.choose('coupon'); await f.until(() => f.owner.source.stage === 'completed')
  const transcript = f.owner.chat.selected.getSnapshot().messages.map(message => message.content).join('\n')
  assert.match(transcript, /962 元/)
  assert.match(transcript, /403 元/)
  assert.match(transcript, /74 元/)
  assert.equal(f.owner.source.stage, 'completed')
  assert.match(f.owner.getSnapshot().dashboard.whiteboard.description, /成交价 79 → 74 元/)
  assert.match(f.owner.getSnapshot().dashboard.whiteboard.note, /711 → 962/)
  f.owner.simulation.setDemo(true); await f.until(() => f.pending().length === 1); await f.choose('confirm'); await f.advance(timing.firstObservationMs)
  await f.choose('pause'); await f.advance(120000)
  assert.equal(f.owner.source.stage, 'paused')
  assert.equal(f.pending().length, 0)
  const restarted = f.owner.chat.selected.getSnapshot().messages.map(message => message.content).join('\n')
  assert.match(restarted, /已暂停新增推广/)
  assert.doesNotMatch(restarted, /962 元|1,106 元|优化后的销售结果。\n\n##/)
})

test('stopping cancels timers and pending menus, restarting clears only scripted exchanges and keeps user drafts', async t => {
  const f = await setup(t)
  f.owner.chat.selected.setDraft('保留我的商品备注')
  f.owner.simulation.setDemo(true); await f.advance(10000)
  f.owner.simulation.setDemo(false); await f.advance(120000)
  assert.equal(f.pending().length, 0)
  assert.equal(f.owner.source.stage, 'stopped')
  assert.equal(f.owner.chat.selected.getSnapshot().draft, '保留我的商品备注')
  f.owner.simulation.setDemo(true); await f.until(() => f.pending().length === 1)
  assert.equal(f.pending().length, 1)
  const messages = f.owner.chat.selected.getSnapshot().messages
  assert.equal(messages.filter(message => message.id === 'commerce-demo:listing-materials:assistant').length, 1)
  assert.equal(f.owner.chat.selected.getSnapshot().draft, '保留我的商品备注')
})

test('the asset conversation keeps its own board while the launch story advances in the background', async () => {
  const source = new CommerceOfficeDataSource('visual')
  source.selectConversation('product-assets')
  const before = await source.getSnapshot()
  source.applyStage('decision')
  const after = await source.getSnapshot()
  assert.deepEqual(after.whiteboard, before.whiteboard)
  assert.equal(after.conversationId, 'product-assets')
  source.selectConversation('main')
  assert.equal((await source.getSnapshot()).whiteboard.status, 'blocked')
  source.selectConversation('conversion-review')
  assert.match((await source.getSnapshot()).whiteboard.title, /经营复盘/)
})

test('explicit replay restores a deleted main demo conversation without restoring other deletions or losing drafts', async t => {
  const f = await setup(t)
  await f.owner.chat.ready
  f.owner.chat.select('conversion-review')
  f.owner.chat.selected.setDraft('保留复盘草稿')
  await f.owner.chat.remove('main')
  await f.owner.chat.remove('product-assets')
  f.owner.simulation.setDemo(true)
  await f.until(() => f.pending().length === 1)
  const chat = f.owner.chat.getSnapshot()
  assert.equal(chat.selectedId, 'main')
  assert(chat.conversations.some(entry => entry.id === f.pending()[0].request.conversationId))
  assert(!chat.conversations.some(entry => entry.id === 'product-assets'))
  assert.match(f.owner.chat.selected.getSnapshot().messages.map(message => message.content).join('\n'), /上架材料已复核/)
  assert.equal(chat.conversations.find(entry => entry.id === 'conversion-review').session.getSnapshot().draft, '保留复盘草稿')
})

test('deleting the main conversation during handoff stops the story and never creates an orphaned decision', async t => {
  const f = await setup(t)
  f.owner.simulation.setDemo(true)
  await f.advance(1000)
  await f.owner.chat.remove('main')
  await f.advance(120000)
  assert.equal(f.owner.source.stage, 'stopped')
  assert.equal(f.owner.simulation.isDemoRunning, false)
  assert.equal(f.pending().length, 0)
  assert(!f.owner.chat.getSnapshot().conversations.some(entry => entry.id === 'main'))
  assert(!f.owner.getSnapshot().dashboard.tasks.length)
})

test('commerce preview replies use current scenario state and never claim live AI or store execution', async () => {
  const source = new CommerceOfficeDataSource('operations')
  const request = text => ({ messages: [{ role: 'user', content: text }] })
  assert.doesNotMatch(source.reply(request('销量怎么样？')), /\| 订单 \|/)
  source.applyStage('decision')
  assert.match(source.reply(request('销量怎么样？')), /\| 订单 \| 9 \|/)
  source.applyStage('completed', 'coupon')
  assert.match(source.reply(request('价格是多少？')), /74 元/)
  assert.match(source.reply(request('看一下复盘数据')), /962 元/)
  assert.match(source.reply(request('标题是什么？')), /固定电商案例/)
  assert.doesNotMatch(source.reply(request('现在进展呢？')), retired)
})

test('every commerce member retains its own waiting, handoff, start and completion history without duplicate refresh entries', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 })
  for (const team of Object.keys(content.commerceTeams)) {
    const source = new CommerceOfficeDataSource(team)
    const initial = await source.getSnapshot()
    for (const employee of initial.employees) assert(memberOverview(initial, employee.id).events.some(event => /待命/.test(event.summary)))
    source.beginDispatch()
    for (const employee of initial.employees.filter(employee => employee.id !== 'office-lead')) {
      t.mock.timers.tick(1000)
      source.acceptAssignment(employee.id)
      const data = await source.getSnapshot(), events = memberOverview(data, employee.id).events
      assert.equal(events[0].kind, 'task.started')
      assert.equal(events[1].kind, 'task.assigned')
      assert.equal(events[1].fromEmployeeId, 'office-lead')
      assert.match(events[2].summary, /待命/)
      assert.equal(source.replayEvents, false, 'recorded handoffs must not dispatch a second animation')
      t.mock.timers.tick(1000)
      source.acceptAssignment(employee.id)
      source.applyStage('dispatching')
      const repeated = await source.getSnapshot()
      assert.deepEqual(repeated.events, data.events)
      assert.equal(repeated.tasks.find(task => task.assigneeId === employee.id).updatedAt, data.tasks.find(task => task.assigneeId === employee.id).updatedAt)
    }
    t.mock.timers.tick(1000)
    source.applyStage('approval')
    const finished = await source.getSnapshot()
    for (const employee of initial.employees) {
      const events = memberOverview(finished, employee.id).events
      assert(events.some(event => event.kind === 'task.started'))
      assert(events.some(event => event.kind === 'task.completed'))
      assert(events.some(event => /待命/.test(event.summary)))
      if (employee.id !== 'office-lead') assert.equal(events[0].kind, 'task.completed')
    }
    assert.equal(new Set(finished.events.map(event => event.id)).size, finished.events.length)
    source.applyStage('approval')
    assert.deepEqual((await source.getSnapshot()).events, finished.events)
  }
})

test('optimization and review activities stay with their performers and survive later stages and conversation switches', async () => {
  const source = new CommerceOfficeDataSource('operations')
  source.beginDispatch()
  for (const employee of (await source.getSnapshot()).employees) source.acceptAssignment(employee.id)
  source.applyStage('approval'); source.applyStage('observing'); source.applyStage('decision'); source.applyStage('optimizing')
  source.acceptAssignment('app-agent')
  source.applyStage('reviewing')
  const reviewing = await source.getSnapshot()
  assert.equal(memberOverview(reviewing, 'app-agent').events[0].kind, 'task.completed')
  assert.match(memberOverview(reviewing, 'app-agent').events[0].summary, /尺寸图/)
  assert.equal(memberOverview(reviewing, 'data-agent').events[0].kind, 'task.started')
  assert.match(memberOverview(reviewing, 'data-agent').events[0].summary, /复核商品更新/)
  source.applyStage('updated'); source.applyStage('completed')
  const completed = await source.getSnapshot()
  assert.equal(memberOverview(completed, 'data-agent').events[0].kind, 'task.completed')
  source.selectConversation('product-assets')
  assert.deepEqual((await source.getSnapshot()).events, [])
  source.selectConversation('conversion-review')
  const review = await source.getSnapshot()
  assert(memberOverview(review, 'data-agent').events.some(event => event.taskId === 'update-review' && event.kind === 'task.completed'))
  assert(review.events.some(event => event.taskId === 'strategy-approval'), 'resolved decision history must remain visible')
  assert(!review.events.some(event => event.taskId === 'product-images'), 'preparation activities belong to the main conversation')
  source.selectConversation('main')
  assert.deepEqual((await source.getSnapshot()).events, completed.events)
})

test('stopping records unfinished members without claiming completion and bounds retained activity history', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 })
  const source = new CommerceOfficeDataSource('operations')
  source.beginDispatch(); source.acceptAssignment('file-agent')
  t.mock.timers.tick(1000)
  source.applyStage('stopped')
  const stopped = await source.getSnapshot()
  for (const employee of stopped.employees) {
    const events = memberOverview(stopped, employee.id).events
    assert(events.some(event => event.kind === 'task.blocked' && /中止/.test(event.summary)))
    assert(events.filter(event => event.kind === 'task.blocked').every(event => Date.parse(event.occurredAt) === 101000))
    assert(!events.some(event => event.kind === 'task.completed'))
  }
  for (let run = 0; run < 50; run++) { source.beginDispatch(); source.applyStage('stopped') }
  const history = await source.getSnapshot()
  assert.equal(history.events.length, 500)
  assert.equal(new Set(history.events.map(event => event.id)).size, history.events.length)
})

test('each member waits for its own completed handoff and the leader makes one continuous five-stop circuit', async t => {
  const f = await setup(t)
  f.owner.simulation.setDemo(true)
  await f.advance(50)
  const activity = f.owner.runtime.snapshot().activities.find(activity => activity.capability === 'office.visit')
  const plan = activity.plan, notified = []
  while (!f.pending().length) {
    const current = f.owner.runtime.readActivePhases().find(phase => phase.activityId === activity.id)
    for (const task of f.owner.getSnapshot().dashboard.tasks.filter(task => task.assigneeId !== 'office-lead')) {
      const reply = plan.phases.findIndex(phase => phase.speech?.some(speech => speech.actorId === task.assigneeId))
      if (task.status === 'running' && !notified.includes(task.assigneeId)) {
        assert(current && current.phaseIndex > reply, `${task.assigneeId} must finish acknowledging before work`)
        notified.push(task.assigneeId)
      }
      if (!notified.includes(task.assigneeId)) {
        assert.equal(task.status, 'queued')
        assert.notEqual(f.owner.runtime.readActors().find(actor => actor.id === task.assigneeId).presentation.status, 'working')
      }
    }
    await f.advance(50)
    assert(Date.now() < 160000, 'the handoff circuit must finish')
  }
  assert.deepEqual(notified, ['file-agent', 'review-agent', 'code-agent', 'data-agent', 'app-agent'])
  for (const session of f.sessions) {
    const visits = session.runtime.snapshot().records.filter(record => record.command.capability === 'office.visit')
    assert.equal(visits.length, 1)
    assert.equal(visits[0].command.params.stops.length, 5)
    assert.equal(visits[0].error, undefined)
    assert.equal(visits[0].status, 'completed')
  }
})

test('elapsed wall time cannot start unnotified tasks or bypass a stalled physical handoff', async t => {
  const f = await setup(t)
  f.owner.simulation.setDemo(true); f.host.advance(50)
  t.mock.timers.tick(120000); await f.refresh()
  assert.equal(f.owner.source.stage, 'dispatching')
  assert.equal(f.pending().length, 0)
  assert(f.owner.getSnapshot().dashboard.tasks.filter(task => task.assigneeId !== 'office-lead').every(task => task.status === 'queued'))
  const command = f.owner.runtime.snapshot().records.find(record => record.command.capability === 'office.visit').command
  f.owner.runtime.submit({ protocolVersion: '2.0', sceneId: f.owner.runtime.sceneId, commandId: 'cancel-handoff', type: 'command.cancel', targetCommandId: command.commandId })
  await f.advance(50)
  assert.equal(f.owner.source.stage, 'stopped')
  assert.equal(f.pending().length, 0)
  assert(!f.owner.getSnapshot().dashboard.tasks.some(task => task.status === 'running'))
})
