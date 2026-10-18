import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'

let server, WhiteboardProgress, createReferenceOfficePropViews
before(async () => {
  server = await createTestServer()
  ;({ WhiteboardProgress } = await server.ssrLoadModule('/packages/scene-office/src/whiteboard.ts'))
  ;({ createReferenceOfficePropViews } = await server.ssrLoadModule('/packages/scene-office/src/pixi/views/referenceOffice.ts'))
})
after(() => server?.close())
const board = () => ({ template: 'task-board-v1', title: '登录模块', status: 'running', steps: [{ id: 'api', title: '接口开发', progress: 0 }] })

test('whiteboard display starts fast, slows down and never completes merely from time', () => {
  let now = 0
  const progress = new WhiteboardProgress({ now: () => now }), data = board()
  assert.equal(progress.project('board', data).steps[0].progress, 0)
  now = 12000
  const first = progress.project('board', data).steps[0].progress
  now = 24000
  const second = progress.project('board', data).steps[0].progress
  assert(first > 0); assert(second > first); assert(second - first < first)
  now = 1000000000
  assert.equal(progress.project('board', data).steps[0].progress, 99)
  assert.equal(data.steps[0].progress, 0)
})

test('whiteboard activity follows the slower stage-level timing instead of reaching 90 percent in thirty seconds', () => {
  let now = 0
  const progress = new WhiteboardProgress({ now: () => now }), data = board()
  progress.project('board', data)
  for (const [elapsed, expected] of [[30000, 28], [60000, 48], [120000, 72], [180000, 85], [300000, 95], [600000, 98]]) {
    now = elapsed
    assert.equal(progress.project('board', data).steps[0].progress, expected, `progress after ${elapsed / 1000}s`)
  }
  assert.equal(data.steps[0].progress, 0)
})

test('reported progress sets the starting point and can move the display forward but never backward', () => {
  let now = 0
  const progress = new WhiteboardProgress({ now: () => now }), data = board()
  data.steps[0].progress = 40
  assert.equal(progress.project('board', data).steps[0].progress, 40)
  now = 60000
  assert.equal(progress.project('board', data).steps[0].progress, 68)
  data.steps[0].progress = 10
  assert.equal(progress.project('board', data).steps[0].progress, 68)
  data.steps[0].progress = 85
  assert.equal(progress.project('board', data).steps[0].progress, 85)
  now += 60000
  assert.equal(progress.project('board', data).steps[0].progress, 91)
  data.status = 'completed'
  assert.equal(progress.project('board', data).steps[0].progress, 100)
  assert.equal(data.steps[0].progress, 85)
})

test('only completed status fills the board to 100 and completion remains until new work', () => {
  let now = 0
  const progress = new WhiteboardProgress({ now: () => now }), data = board()
  data.steps[0].progress = 100
  assert.equal(progress.project('board', data).steps[0].progress, 99)
  data.status = 'completed'; data.steps[0].progress = 25
  assert.equal(progress.project('board', data).steps[0].progress, 100)
  now += 60000
  assert.equal(progress.project('board', data).steps[0].progress, 100)
  data.status = 'running'; data.steps[0].progress = 0
  assert.equal(progress.project('board', data).steps[0].progress, 0)
  now += 1000
  assert(progress.project('board', data).steps[0].progress > 0)
})

test('blocked, failed and queued boards pause and reduced motion does not synthesize movement', () => {
  let now = 0
  const progress = new WhiteboardProgress({ now: () => now }), data = board()
  progress.project('board', data); now = 1000
  for (const status of ['blocked', 'failed', 'queued']) {
    data.status = status
    const before = progress.project('board', data).steps[0].progress
    now += 60000
    assert.equal(progress.project('board', data).steps[0].progress, before)
  }
  data.status = 'running'
  const before = progress.project('board', data).steps[0].progress
  now += 1000
  assert(progress.project('board', data).steps[0].progress > before)
  const reduced = new WhiteboardProgress({ now: () => now, reduceMotion: true })
  assert.equal(reduced.project('board', data).steps[0].progress, 0)
  now += 60000
  assert.equal(reduced.project('board', data).steps[0].progress, 0)
  data.status = 'completed'
  assert.equal(reduced.project('board', data).steps[0].progress, 100)
})

test('teams, board identities and immutable backend payloads remain independent', () => {
  let now = 0
  const a = new WhiteboardProgress({ now: () => now }), b = new WhiteboardProgress({ now: () => now })
  const data = board()
  Object.freeze(data.steps[0]); Object.freeze(data.steps); Object.freeze(data)
  a.project('board', data); now += 5000
  assert(a.project('board', data).steps[0].progress > 0)
  assert.equal(b.project('board', data).steps[0].progress, 0)
  assert.equal(a.project('another-board', data).steps[0].progress, 0)
  assert.equal(a.project('board', { ...data, title: '新的任务' }).steps[0].progress, 0)
  assert.equal(data.steps[0].progress, 0)
})

test('the wall whiteboard advances without business revisions and completes from received status', () => {
  let now = 0
  const progress = new WhiteboardProgress({ now: () => now })
  const prop = { id: 'board', position: { x: 0, y: 0 }, stateRevision: 0, state: { taskBoard: board() } }
  const view = createReferenceOfficePropViews(progress).create(prop, { view: 'wall-whiteboard' })
  try {
    view.update(prop, {}, [])
    const text = view.roots[0].children[0]
    assert(text.text.includes('aria-valuenow="0"'))
    const initial = text.text
    now = 6000; view.updateFrame(.1)
    assert.equal(text.text, initial)
    view.updateFrame(.15)
    assert.notEqual(text.text, initial)
    assert(!text.text.includes('aria-valuenow="100"'))
    prop.state.taskBoard.status = 'completed'; prop.stateRevision++
    view.update(prop, {}, [])
    assert(text.text.includes('已完成')); assert(text.text.includes('aria-valuenow="100"'))
    now += 60000; view.updateFrame(1)
    assert(text.text.includes('aria-valuenow="100"'))
  } finally { view.roots.forEach(root => root.destroy({ children: true })) }
})
