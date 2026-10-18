import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'
import { Rectangle } from 'pixi.js'

let server, officeActorTasks, TaskBadge
before(async () => {
  server = await createTestServer()
  ;({ officeActorTasks } = await server.ssrLoadModule('/example/office-web/src/dashboard/actorTasks.ts'))
  ;({ TaskBadge } = await server.ssrLoadModule('/packages/renderer-pixi/src/ui/TaskBadge.ts'))
})
after(() => server?.close())
const stubMetrics = badge => {
  for (const text of [badge.titleText, badge.statusText, badge.detailText, badge.percentText]) {
    Object.defineProperties(text, {
      width: { get: () => Math.min(text.text.length * 6, text.style.wordWrap ? text.style.wordWrapWidth : Infinity) },
      height: { get: () => 16 * Math.max(1, Math.ceil(text.text.length * 6 / (text.style.wordWrap ? text.style.wordWrapWidth : Infinity))) },
    })
  }
}

test('shared actor task selection aggregates all bindings instead of taking the last employee', () => {
  const updatedAt = '2026-10-18T10:00:00Z'
  const data = { employees: [{ id: 'coding', sceneActorId: 'shared' }, { id: 'review', sceneActorId: 'shared' }], tasks: [
    { id: 'coding', title: '写代码', assigneeId: 'coding', status: 'running', updatedAt },
    { id: 'review', title: '审查', assigneeId: 'review', status: 'blocked', updatedAt },
  ] }
  const before = structuredClone(data)
  assert.equal(officeActorTasks(data).get('shared').id, 'coding')
  assert.deepEqual(data, before)
  data.employees.reverse(); data.tasks.reverse()
  assert.equal(officeActorTasks(data).get('shared').id, 'coding')
  data.tasks.find(task => task.id === 'coding').status = 'completed'
  assert.equal(officeActorTasks(data).get('shared').id, 'review')
  data.tasks.find(task => task.id === 'review').status = 'completed'
  assert.equal(officeActorTasks(data).get('shared').status, 'completed')
})

test('equal priority shared tasks use actual update time and stable task IDs rather than array order', () => {
  const data = { employees: [{ id: 'one', sceneActorId: 'shared' }, { id: 'two', sceneActorId: 'shared' }], tasks: [
    { id: 'a', title: '旧任务', assigneeId: 'one', status: 'running', updatedAt: '2026-10-18T10:00:00+08:00' },
    { id: 'b', title: '新任务', assigneeId: 'two', status: 'running', updatedAt: '2026-10-18T03:00:00Z' },
  ] }
  assert.equal(officeActorTasks(data).get('shared').id, 'b')
  data.tasks[0].updatedAt = '2026-10-18T11:00:00+08:00'
  assert.equal(officeActorTasks(data).get('shared').id, 'a', 'equal timestamps use the smaller stable task ID')
  data.employees.reverse(); data.tasks.reverse()
  assert.equal(officeActorTasks(data).get('shared').id, 'a')
})

test('task badges use current team data, prefer active work and leave unknown progress unknown', () => {
  const data = { employees: [{ id: 'one', sceneActorId: 'actor-one' }, { id: 'two', sceneActorId: 'actor-two' }], tasks: [
    { id: 'done', title: '已结束', assigneeId: 'one', status: 'completed', progress: 100 },
    { id: 'queue', title: '排队', assigneeId: 'one', status: 'queued', progress: 0 },
    { id: 'run', title: '执行中', assigneeId: 'one', status: 'running', summary: '检查数据', progress: 68 },
    { id: 'blocked', title: '等待处理', assigneeId: 'two', status: 'blocked' },
  ] }
  const tasks = officeActorTasks(data)
  assert.deepEqual(tasks.get('actor-one'), { id: 'run', title: '执行中', detail: '检查数据', status: 'running', progress: 68, progressMode: 'activity' })
  assert.equal(tasks.get('actor-two').progress, undefined)
  data.tasks = [data.tasks[0]]
  assert.equal(officeActorTasks(data).get('actor-one').status, 'completed')
  assert.equal(officeActorTasks(null).size, 0)
})

test('task badges expand only for hover or selection, and do not redraw unchanged data', t => {
  const badge = new TaskBadge(); t.after(() => badge.destroy({ children: true }))
  stubMetrics(badge)
  const spy = t.mock.method(badge, 'redraw', badge.redraw)
  const data = { title: '接口实现', detail: '这是非常长的执行说明。'.repeat(30), status: 'running', progress: 68 }
  badge.setTask(data)
  assert.equal(badge.isExpanded, false); assert.equal(badge.detailText.visible, true)
  assert.equal(badge.percentText.visible, true)
  assert.equal(badge.titleText.style.fontSize, 16)
  assert.equal(badge.titleText.style.fontWeight, '700')
  assert.equal(badge.detailText.style.fontSize, 12)
  assert.equal(badge.detailText.style.fontWeight, '400')
  assert.equal(badge.hitArea.x + badge.hitArea.width / 2, 0)
  const renders = spy.mock.callCount()
  badge.setTask({ ...data }); assert.equal(spy.mock.callCount(), renders)
  badge.setHovered(true)
  assert.equal(badge.detailText.visible, true); assert.equal(badge.percentText.text, '68%')
  assert(badge.detailText.height <= 32)
  assert.equal(badge.hitArea.x + badge.hitArea.width / 2, 0, 'expanded cards remain centered')
  badge.setSelected(true); badge.setHovered(false); assert.equal(badge.isExpanded, true)
  badge.setSelected(false); assert.equal(badge.isExpanded, false)
  badge.setPlacement('right')
  assert.equal(badge.hitArea.x, 0)
  assert.equal(badge.topY, -35)
  assert.equal(badge.percentText.y, 27.5)
  assert.equal(badge.percentText.text, '68%', 'changing placement preserves task progress')
  badge.setTask({ title: '无进度任务', status: 'blocked' }); badge.setHovered(true)
  assert.equal(badge.percentText.visible, false); assert.equal(badge.track.context.instructions.length, 0)
  badge.setTask({ title: '待命', status: 'idle' })
  assert.equal(badge.detailText.visible, false); assert.equal(badge.percentText.visible, false)
})

test('head overlays follow the actor without inheriting body scale and are disposed with it', async t => {
  const { ActorView } = await server.ssrLoadModule('/packages/renderer-pixi/src/ActorView.ts')
  const { StatusLabel } = await server.ssrLoadModule('/packages/renderer-pixi/src/ui/StatusLabel.ts')
  const { Bubble } = await server.ssrLoadModule('/packages/renderer-pixi/src/ui/Bubble.ts')
  t.mock.method(StatusLabel.prototype, 'paintStateDot', () => {})
  t.mock.method(StatusLabel.prototype, 'getLabelTopY', () => -120)
  t.mock.method(TaskBadge.prototype, 'redraw', () => {})
  t.mock.method(Bubble.prototype, 'redraw', () => {})
  const actor = { id: 'one', name: '王明', appearanceId: 'one', displayHeight: 126, depth: 400,
    position: { x: 300, y: 400 }, status: 'idle', intent: { actionId: 'core.idle', poseId: 'standing', view: 'front' },
    label: { placement: 'above', scale: 1.25 }, task: { title: '检查数据', status: 'running' } }
  const view = new ActorView(actor)
  assert.equal(view.overlay.parent, null, 'the scene mounts labels above furniture in a separate layer')
  assert.equal(view.overlay.scale.x, 1)
  assert.equal(view.appearance.scale.x, 126)
  assert.deepEqual([view.overlay.x, view.overlay.y], [300, 400])
  assert.equal(view.taskBadge.x, 0)
  view.update({ ...actor, position: { x: 350, y: 450 } }, .05)
  assert.deepEqual([view.overlay.x, view.overlay.y], [350, 450])
  const anchored = { ...actor, taskAnchor: { x: 300, y: 200, placement: 'right' } }
  view.update(anchored, .05)
  view.update({ ...anchored, position: { x: 370, y: 490 }, bubble: '交谈中' }, .05)
  assert.equal(view.overlay.x + view.taskBadge.x, 300)
  assert.equal(view.overlay.y + view.taskBadge.y, 200, 'the task remains at the computer while its owner moves')
  assert.equal(view.taskBadge.visible, true, 'computer tasks stay visible when their owner speaks')
  assert.equal(view.taskBadge.placement, 'right')
  view.setSelected(true); assert.equal(view.overlay.zIndex, Number.MAX_SAFE_INTEGER)
  view.setSelected(false); assert.equal(view.overlay.zIndex, actor.depth)
  view.update({ ...anchored, position: { x: 300, y: 230 } }, .05)
  assert.equal(view.taskBadge.visible, true, 'passing through the task area never hides the card')
  view.setTaskOccluded(true, .05); assert.equal(view.taskBadge.isCompact, true)
  view.setTaskOccluded(false, .1); assert.equal(view.taskBadge.isCompact, true, 'brief gaps do not cause flicker')
  view.setTaskOccluded(false, .09); assert.equal(view.taskBadge.isCompact, false)
  view.destroy({ children: true })
  assert(view.overlay.destroyed); assert(view.taskBadge.destroyed)
})

test('only the surface is half transparent and the complete task stays visible', t => {
  const badge = new TaskBadge(); t.after(() => badge.destroy({ children: true }))
  stubMetrics(badge); badge.setPlacement('right')
  badge.setTask({ id: 'one', title: '接口开发', detail: '核验登录接口', status: 'running', progress: 68 })
  assert.equal(badge.bg.alpha, .5)
  for (const part of [badge, badge.titleText, badge.detailText, badge.track, badge.percentText]) assert.equal(part.alpha, 1)
  assert.equal(badge.detailText.visible, true); assert.equal(badge.percentText.visible, true)
  assert.equal(badge.hitArea.height, 70)
  badge.setTask({ id: 'one', title: '接口开发', detail: '核验登录接口', status: 'running', progress: 90 })
  badge.update(.3)
  badge.setHovered(true)
  assert.equal(badge.detailText.visible, true)
  assert.equal(badge.percentText.text, '90%')
  badge.setHovered(false)
  assert.equal(badge.detailText.visible, true); assert.equal(badge.percentText.text, '90%')
  assert.equal(badge.hitArea.height, 70, 'leaving hover preserves the full default card')
})

test('speech bubbles keep task title size and surface opacity with readable semibold text', async t => {
  const { Bubble } = await server.ssrLoadModule('/packages/renderer-pixi/src/ui/Bubble.ts')
  const bubble = new Bubble(), badge = new TaskBadge()
  t.after(() => { bubble.destroy({ children: true }); badge.destroy({ children: true }) })
  Object.defineProperties(bubble.messageText, {
    width: { get: () => 180 },
    height: { get: () => 44 },
  })
  bubble.show('我们同步一下这一轮工作的进展。', 4)
  assert.equal(bubble.messageText.style.fontSize, badge.titleText.style.fontSize)
  assert.equal(bubble.messageText.style.fontSize, 16)
  assert.equal(bubble.messageText.style.fontWeight, '600')
  assert.equal(bubble.messageText.style.fill, 0x263c36)
  assert.equal(bubble.messageText.style.lineHeight, 22)
  assert.equal(bubble.messageText.style.wordWrapWidth, 180)
  assert.equal(bubble.messageText.style.breakWords, true)
  assert.equal(bubble.bg.alpha, badge.bg.alpha)
  assert.equal(bubble.bg.alpha, .5)
  assert.equal(bubble.messageText.alpha, 1)
  assert.equal(bubble.alpha, 1)
  assert.equal(bubble.messageText.y, -43, 'larger text stays centered above the existing tail anchor')
  assert.equal(Bubble.TAIL_TIP_Y, -4)
  assert.equal(bubble.update(3.75), true)
  assert.equal(bubble.alpha, .5, 'the existing dismissal fade is preserved')
  assert.equal(bubble.update(.25), false)
  assert.equal(bubble.visible, false)
})

test('progress animates only toward received data and resets for a different task', t => {
  const badge = new TaskBadge(); t.after(() => badge.destroy({ children: true }))
  t.mock.method(badge, 'redraw', () => {})
  t.mock.method(badge, 'paintProgress', () => {})
  badge.setTask({ id: 'one', title: '资料搜集', status: 'running', progress: 20 })
  assert.equal(badge.displayedProgress, 20)
  badge.setTask({ id: 'one', title: '资料搜集', status: 'running', progress: 70 })
  assert.equal(badge.displayedProgress, 20, 'received updates do not jump')
  badge.update(.1)
  assert(badge.displayedProgress > 20 && badge.displayedProgress < 70)
  badge.update(.2); assert.equal(badge.displayedProgress, 70)
  badge.update(100); assert.equal(badge.displayedProgress, 70, 'time alone never changes task progress')
  badge.setTask({ id: 'two', title: '资料搜集', status: 'running', progress: 5 })
  assert.equal(badge.displayedProgress, 5, 'new tasks do not inherit the old task progress')
  badge.setTask({ id: 'two', title: '资料搜集', status: 'running' })
  assert.equal(badge.displayedProgress, undefined)
})

test('office display progress starts fast, slows down and never completes from time or reported percentages', t => {
  const badge = new TaskBadge(); t.after(() => badge.destroy({ children: true }))
  stubMetrics(badge)
  const data = { id: 'one', title: '接口开发', status: 'running', progressMode: 'activity', progress: 100 }
  badge.setTask(data)
  assert.equal(badge.displayedProgress, 0)
  badge.update(6)
  const first = badge.displayedProgress
  badge.update(6)
  const second = badge.displayedProgress
  assert(first > 0 && second > first)
  assert(second - first < first, 'equal time intervals contribute progressively less display progress')
  badge.setTask({ ...data, detail: '内容更新' })
  assert.equal(badge.displayedProgress, second, 'snapshot updates do not restart the display animation')
  badge.update(100000)
  assert.equal(badge.displayedProgress, 99)
  assert.equal(badge.percentText.text, '99%')
  assert.equal(badge.data.status, 'running')
  assert.equal(data.progress, 100, 'display animation never mutates the reported task')
})

test('completed office tasks fill immediately and remain visible until replaced by another task', t => {
  const badge = new TaskBadge(); t.after(() => badge.destroy({ children: true }))
  stubMetrics(badge)
  const task = { id: 'one', title: '接口开发', detail: '核验接口', status: 'running', progressMode: 'activity' }
  badge.setTask(task); badge.setHovered(true); badge.update(6)
  badge.setTask({ ...task, status: 'completed', progress: 25 })
  assert.equal(badge.displayedProgress, 100)
  assert.equal(badge.percentText.text, '100%')
  assert.equal(badge.detailText.text, '核验接口')
  assert.equal(badge.statusText.text, '已完成')
  assert.equal(badge.statusText.visible, true)
  assert.equal(badge.barLayout.color, 0x36b57e)
  badge.update(1000); badge.setHovered(false); badge.setHovered(true)
  assert.equal(badge.visible, true)
  assert.equal(badge.displayedProgress, 100)
  badge.setTask({ ...task, id: 'two', title: '下一项任务' })
  assert.equal(badge.displayedProgress, 0)
  assert.equal(badge.statusText.visible, false)
  badge.update(1)
  assert(badge.displayedProgress > 0 && badge.displayedProgress < 100)
})

test('completed cards keep descriptions without changing the no-description status fallback', t => {
  const badge = new TaskBadge(); t.after(() => badge.destroy({ children: true }))
  stubMetrics(badge); badge.setPlacement('right')
  badge.setTask({ id: 'done', title: '测试报告', detail: '测试通过，报告已生成。', status: 'completed', progressMode: 'activity' })
  assert.equal(badge.detailText.text, '测试通过，报告已生成。')
  assert.equal(badge.statusText.visible, true)
  assert(badge.titleText.x + badge.titleText.width < badge.statusText.x - badge.statusText.width)
  badge.setHovered(true)
  assert.equal(badge.detailText.text, '测试通过，报告已生成。')
  badge.setHovered(false); badge.setOccluded(true)
  assert.equal(badge.statusText.visible, false, 'folded cards keep their checkmark without overlapping the title')
  badge.setOccluded(false)
  assert.equal(badge.statusText.visible, true)
  badge.setTask({ id: 'without-detail', title: '测试报告', status: 'completed', progressMode: 'activity' })
  assert.equal(badge.detailText.text, '已完成')
  assert.equal(badge.statusText.visible, false, 'do not duplicate the fallback status')
})

test('completed task selection remains on the computer until another unfinished task takes over', () => {
  const data = { employees: [{ id: 'one', sceneActorId: 'shared' }], tasks: [
    { id: 'old', title: '旧任务', assigneeId: 'one', status: 'completed', updatedAt: '2026-10-18T10:00:00Z' },
    { id: 'latest', title: '当前任务', assigneeId: 'one', status: 'completed', updatedAt: '2026-10-18T11:00:00Z' },
  ] }
  assert.equal(officeActorTasks(data).get('shared').id, 'latest')
  data.tasks.reverse()
  assert.equal(officeActorTasks(data).get('shared').id, 'latest')
  data.tasks.push({ id: 'next', title: '下一项任务', assigneeId: 'one', status: 'queued', updatedAt: '2026-10-18T12:00:00Z' })
  assert.equal(officeActorTasks(data).get('shared').id, 'next')
})

test('office display progress pauses for blocked or failed work and respects reduced motion', t => {
  const badge = new TaskBadge(); t.after(() => badge.destroy({ children: true }))
  stubMetrics(badge)
  const task = { id: 'one', title: '检查接口', status: 'running', progressMode: 'activity' }
  badge.setTask(task); badge.update(6)
  const progress = badge.displayedProgress
  for (const status of ['blocked', 'failed', 'queued']) {
    badge.setTask({ ...task, status }); badge.update(100)
    assert.equal(badge.displayedProgress, progress)
  }
  badge.setTask(task); badge.update(1)
  assert(badge.displayedProgress > progress)
  Object.defineProperty(badge, 'reduceMotion', { value: true })
  const paused = badge.displayedProgress
  badge.update(100)
  assert.equal(badge.displayedProgress, paused)
  badge.setTask({ ...task, status: 'completed' })
  assert.equal(badge.displayedProgress, 100)
})

test('occluded cards fold without changing opacity, anchors or progress', t => {
  const badge = new TaskBadge(); t.after(() => badge.destroy({ children: true }))
  stubMetrics(badge); badge.setPlacement('right'); badge.position.set(300, 200)
  badge.setTask({ id: 'one', title: '接口开发', detail: '核验登录接口', status: 'running', progress: 68 })
  const full = badge.occlusionBounds.clone()
  badge.setOccluded(true)
  assert.equal(badge.bg.alpha, .5)
  assert.equal(badge.isCompact, true); assert.equal(badge.hitArea.height, 31)
  assert.equal(badge.detailText.visible, false); assert.equal(badge.percentText.visible, false)
  assert.deepEqual(badge.occlusionBounds, full, 'folding must not change the area used to detect passing actors')
  assert.deepEqual([badge.x, badge.y], [300, 200])
  badge.setTask({ id: 'one', title: '接口开发', detail: '核验登录接口', status: 'running', progress: 90 })
  badge.update(.3)
  badge.setHovered(true); assert.equal(badge.isCompact, false)
  assert.equal(badge.percentText.text, '90%')
  badge.setHovered(false); assert.equal(badge.isCompact, true)
  badge.setOccluded(false)
  assert.equal(badge.isCompact, false); assert.equal(badge.detailText.visible, true)
  assert.equal(badge.percentText.text, '90%'); assert.equal(badge.bg.alpha, .5)
})

test('task occlusion checks every actor, including visitors', async () => {
  const { SceneView } = await server.ssrLoadModule('/packages/renderer-pixi/src/SceneView.ts')
  const scene = Object.create(SceneView.prototype), values = []
  const visitor = new Rectangle(100, 10, 40, 80)
  scene.agentEntities = new Map([
    ['owner', { getVisualBounds: () => new Rectangle(0, 0, 40, 90), getTaskOcclusionBounds: () => new Rectangle(60, 0, 186, 70), setTaskOccluded: value => values.push(value) }],
    ['visitor', { getVisualBounds: () => visitor, getTaskOcclusionBounds: () => undefined, setTaskOccluded() {} }],
  ])
  scene.syncTaskOcclusion(.05); assert.equal(values.at(-1), true)
  visitor.x = 300
  scene.syncTaskOcclusion(.2); assert.equal(values.at(-1), false)
})
