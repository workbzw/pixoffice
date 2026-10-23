import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTestServer } from './helpers/vite.mjs'

let server, schema, interaction, demo, selectors, blocks, integration
before(async () => {
  server = await createTestServer()
  schema = await server.ssrLoadModule('/packages/protocol/src/agent-insights.ts')
  interaction = await server.ssrLoadModule('/example/office-web/src/application/ActorInsightInteraction.ts')
  demo = await server.ssrLoadModule('/example/office-web/src/dashboard/demoSource.ts')
  selectors = await server.ssrLoadModule('/example/office-web/src/dashboard/insightSelectors.ts')
  blocks = await server.ssrLoadModule('/example/office-web/src/components/insights/InsightBlocks.tsx')
  integration = await server.ssrLoadModule('/packages/protocol/src/office-integration.ts')
})
after(() => server?.close())

test('example history validates, varies by member and does not follow simulated progress', async () => {
  const source = new demo.ExampleOfficeDataSource(new Date('2026-10-22T02:00:00Z'))
  const snapshot = await source.getSnapshot()
  const kinds = new Set()
  for (const employee of snapshot.employees) {
    const insights = schema.agentInsightsSchema.parse(employee.insights)
    assert.equal(insights.scope, 'conversation')
    assert.deepEqual(insights.periods.map(period => period.id), ['last7Days', 'last30Days'])
    kinds.add(insights.periods[0].blocks[0].type)
    assert(insights.periods[0].metrics[0].value < insights.periods[1].metrics[0].value)
    for (const period of insights.periods) {
      const trend = period.blocks.find(block => block.type === 'trend')
      assert.equal(trend.points.reduce((sum, point) => sum + point.value, 0), period.metrics[0].value)
      const categories = period.blocks.find(block => block.type === 'bars')
      if (categories) assert.equal(categories.items.reduce((sum, item) => sum + item.value, 0), period.metrics[0].value)
    }
  }
  assert.deepEqual(kinds, new Set(['trend', 'bars', 'distribution']))
  const before = structuredClone(snapshot.employees)
  await source.execute({ type: 'task.complete', taskId: 'market-research' })
  assert.deepEqual((await source.getSnapshot()).employees, before)
})

test('statistics are optional, strictly typed, bounded and never accept null', async () => {
  const snapshot = await new demo.ExampleOfficeDataSource().getSnapshot()
  const base = structuredClone(snapshot.employees[0].insights)
  assert(schema.agentInsightsSchema.safeParse(base).success)
  for (const invalid of [null, { ...base, periods: null }, { ...base, periods: [...base.periods, base.periods[0]] }]) {
    assert.equal(schema.agentInsightsSchema.safeParse(invalid).success, false)
  }
  const invalid = structuredClone(base)
  invalid.periods[0].metrics[0].value = -.5
  assert.equal(schema.agentInsightsSchema.safeParse(invalid).success, false)
  invalid.periods[0].metrics[0].value = -1
  assert(schema.agentInsightsSchema.safeParse(invalid).success)
  invalid.periods[0].blocks.push({ id: 'html', type: 'html', title: 'bad', html: '<script />' })
  assert.equal(schema.agentInsightsSchema.safeParse(invalid).success, false)
  const remote = integration.officeSnapshotSchema.parse({ schemaVersion: '1.0', seq: 1, workspace: snapshot.workspace,
    conversations: [{ id: 'main', title: '会话', employees: snapshot.employees, tasks: snapshot.tasks }] })
  assert.deepEqual(remote.conversations[0].employees[0].insights, schema.agentInsightsSchema.parse(base))
  delete remote.conversations[0].employees[0].insights
  assert(integration.officeSnapshotSchema.safeParse(remote).success)
})

test('commerce stages preserve independent member statistics and use commerce-specific activity labels', async () => {
  const { CommerceOfficeDataSource } = await server.ssrLoadModule('/example/office-web/src/dashboard/CommerceOfficeDataSource.ts')
  const source = new CommerceOfficeDataSource('operations', new Date('2026-10-22T02:00:00Z'))
  const before = await source.getSnapshot()
  for (const employee of before.employees) {
    assert(schema.agentInsightsSchema.safeParse(employee.insights).success)
    assert.doesNotMatch(JSON.stringify(employee.insights), /接口|代码|缺陷|技术调研/)
  }
  source.beginDispatch(); source.acceptAssignment('file-agent'); source.applyStage('approval')
  const after = await source.getSnapshot()
  assert.deepEqual(after.employees, before.employees, 'task progress must not rewrite historical statistics')
  assert(after.events.some(event => event.employeeId === 'file-agent' && event.kind === 'task.completed'))
  source.selectConversation('product-assets')
  assert((await source.getSnapshot()).employees.every(employee => schema.agentInsightsSchema.safeParse(employee.insights).success))
})

test('one visual actor can expose separate member histories without merging them', async () => {
  const snapshot = await new demo.ExampleOfficeDataSource().getSnapshot()
  snapshot.employees[1].sceneActorId = snapshot.employees[0].sceneActorId
  const initial = selectors.actorInsightSubject(snapshot, 'office-lead')
  assert.equal(initial.employees.length, 2)
  assert.equal(initial.employee.id, 'code-agent', 'prefer the member currently working')
  const selected = selectors.actorInsightSubject(snapshot, 'office-lead', 'office-lead')
  assert.equal(selected.employee.id, 'office-lead')
  assert.notDeepEqual(selected.employee.insights, initial.employee.insights)
  assert.equal(selectors.actorInsightSubject(snapshot, 'unbound').employee, undefined)
  assert.equal(selectors.actorInsightSubject(undefined, 'office-lead').task, undefined)
})

test('hover opens immediately, crossing into the popover stays open, pinned views ignore hover changes', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const state = new interaction.ActorInsightInteraction(), a = { actorId: 'a', clientX: 300, clientY: 400 }, b = { ...a, actorId: 'b' }
  state.enter(a); assert.equal(state.getSnapshot().actorId, 'a'); assert.equal(state.getSnapshot().pinned, false)
  state.leave('a'); t.mock.timers.tick(239); assert.equal(state.getSnapshot().actorId, 'a')
  t.mock.timers.tick(1); assert.equal(state.getSnapshot(), undefined)
  state.enter(a); assert.equal(state.getSnapshot().pinned, false)
  state.leave('a'); t.mock.timers.tick(100); state.retain(); t.mock.timers.tick(500)
  assert.equal(state.getSnapshot().actorId, 'a')
  state.leave('a'); t.mock.timers.tick(500)
  assert.equal(state.getSnapshot().actorId, 'a', 'a delayed canvas leave cannot close a hovered DOM popover')
  state.leavePopover('a'); t.mock.timers.tick(240); assert.equal(state.getSnapshot(), undefined)
  state.enter(a)
  state.pin(); state.enter(b); state.leave('a'); t.mock.timers.tick(1000)
  assert.equal(state.getSnapshot().actorId, 'a')
  state.retain(); state.togglePin(); assert.equal(state.getSnapshot().pinned, false)
  state.togglePin(); assert.equal(state.getSnapshot().pinned, true)
  state.close(); assert.equal(state.getSnapshot(), undefined)
  state.enter(a); state.enter(b); assert.equal(state.getSnapshot().actorId, 'b')
  state.leave('a'); t.mock.timers.tick(1000); assert.equal(state.getSnapshot().actorId, 'b')
  state.leave('b'); state.dispose(); t.mock.timers.tick(1000); assert.equal(state.getSnapshot(), undefined)
})

test('popover flips near the right edge and remains within narrow or short viewports', () => {
  const place = interaction.placeActorInsights
  const left = place({ x: 1100, y: 100 }, { width: 392, height: 480 }, { width: 1200, height: 800 })
  assert.equal(left.side, 'left'); assert(left.left >= 12 && left.top >= 12)
  const mobile = place({ x: 180, y: 800 }, { width: 366, height: 600 }, { width: 390, height: 844 })
  assert.equal(mobile.left, 12); assert(mobile.top + 600 <= 832)
})

test('registered block renderers handle trend, bars, distribution and escaped activity text', async () => {
  const snapshot = await new demo.ExampleOfficeDataSource().getSnapshot()
  for (const employee of snapshot.employees) for (const block of employee.insights.periods[0].blocks) {
    const html = renderToStaticMarkup(createElement(blocks.InsightBlock, { block }))
    assert(html.includes(block.title)); assert(!html.includes('NaN'))
  }
  const html = renderToStaticMarkup(createElement(blocks.InsightBlock, { block: { id: 'safe', type: 'activity', title: '动态', items: [
    { label: '<script>alert(1)</script>', occurredAt: '2026-10-22T02:00:00Z', status: 'completed' },
  ] } }))
  assert(!html.includes('<script>')); assert(html.includes('&lt;script&gt;'))
})
