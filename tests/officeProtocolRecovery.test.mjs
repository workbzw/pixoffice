import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPixOfficeServer, DEMO_API_KEY } from '../server/dist/app.js'
import { officeErrorResultSchema } from '@pixoffice/protocol/office-integration'

const snapshot = (seq = 1) => ({ schemaVersion: '1.0', seq, workspace: { id: 'team-a', name: '研发办公室' }, employees: [{ id: 'dev', name: '开发', sceneActorId: 'office-lead' }],
  tasks: [{ id: 'task', title: '登录开发', assigneeId: 'dev', status: seq > 1 ? 'completed' : 'running', summary: '开发登录模块', updatedAt: '2026-10-18T10:00:00Z' }], events: [],
  whiteboard: { template: 'task-board-v1', title: `项目 ${seq}`, status: seq > 1 ? 'completed' : 'running', steps: [{ id: 'develop', title: '开发', progress: seq > 1 ? 100 : 20 }] } })
const post = (app, data) => app.inject({ method: 'POST', url: '/api/pixoffice/messages', headers: { authorization: `Bearer ${DEMO_API_KEY}` }, payload: data })
async function setup(t, options = {}) {
  const app = await createPixOfficeServer(options), base = await app.listen({ host: '127.0.0.1', port: 0 })
  t.after(() => app.close())
  return { app, base }
}
async function stream(t, base, query = 'workspace=1') {
  const controller = new AbortController(), response = await fetch(`${base}/api/pixoffice/events?${query}`, { signal: controller.signal })
  const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = ''
  t.after(async () => { controller.abort(); await reader.cancel().catch(() => {}) })
  return { close: () => controller.abort(), async next() {
    for (;;) {
      const end = buffer.indexOf('\n\n')
      if (end >= 0) { const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2); if (frame.startsWith('data: ')) { const value = JSON.parse(frame.slice(6)); if (!['office.sync.start', 'office.sync.complete'].includes(value.type)) return value }; continue }
      const part = await reader.read(); if (part.done) throw new Error('closed'); buffer += decoder.decode(part.value, { stream: true })
    }
  } }
}

test('offline state is cached, stale snapshots ignored and new browsers receive the latest full state', async t => {
  const { app, base } = await setup(t)
  const initialized = await post(app, { type: 'offices.initialize', offices: [snapshot()] })
  assert.equal(initialized.statusCode, 202); assert.equal(initialized.json().data.offices[0].runtimeReady, false)
  assert.equal((await post(app, { type: 'office.snapshot', teamId: 'team-a', snapshot: snapshot(2) })).statusCode, 202)
  const stale = await post(app, { type: 'office.snapshot', teamId: 'team-a', snapshot: snapshot() })
  assert.equal(stale.statusCode, 200); assert.equal(stale.json().data.reasonCode, 'STALE_SEQ')
  const conflicting = snapshot(2); conflicting.tasks[0].title = '冲突内容'
  assert.equal((await post(app, { type: 'office.snapshot', teamId: 'team-a', snapshot: conflicting })).statusCode, 409)
  const first = await stream(t, base), frame = await first.next()
  assert.equal(frame.type, 'office.sync'); assert.equal(frame.snapshot.seq, 2)
  assert.equal(frame.snapshot.tasks[0].status, 'completed'); assert.equal(frame.snapshot.whiteboard.title, '项目 2')
  first.close()
  const another = await stream(t, base)
  assert.equal((await another.next()).snapshot.seq, 2)
})

for (const failure of ['rejected', 'timeout']) test(`an identical snapshot retry reaches the browser after ${failure}`, { timeout: 5000 }, async t => {
  const { app, base } = await setup(t, { officeRequestMs: 500 })
  await post(app, { type: 'offices.initialize', offices: [snapshot()] })
  const browser = await stream(t, base); await browser.next()
  const request = { type: 'office.snapshot', teamId: 'team-a', snapshot: snapshot(2) }
  const first = post(app, request).then(value => value), delivery = await browser.next()
  if (failure === 'rejected') await app.inject({ method: 'POST', url: '/api/pixoffice/reply', payload: {
    responseToken: delivery.responseToken, result: { code: 422, msg: 'Board unavailable', data: { reasonCode: 'SCENE_SYNC_FAILED' } },
  } })
  assert.equal((await first).statusCode, failure === 'rejected' ? 422 : 408)
  let settled = false
  const retry = post(app, request).then(value => { settled = true; return value })
  const repeated = await browser.next()
  assert.equal(repeated.type, 'office.request')
  assert.equal(repeated.request.snapshot.seq, 2)
  assert.equal(settled, false, 'a cache hit must not claim that the browser applied the snapshot')
  assert.notEqual(repeated.responseToken, delivery.responseToken)
  await app.inject({ method: 'POST', url: '/api/pixoffice/reply', payload: { responseToken: repeated.responseToken,
    result: { code: 200, msg: 'Applied', data: { teamId: 'team-a', seq: 2, status: 'applied' } } } })
  const result = await retry
  assert.equal(result.statusCode, 200); assert.equal(result.json().data.status, 'applied')
})

test('offline identical snapshots remain cached rather than claiming successful application', async t => {
  const { app } = await setup(t)
  await post(app, { type: 'offices.initialize', offices: [snapshot()] })
  const result = await post(app, { type: 'office.snapshot', teamId: 'team-a', snapshot: snapshot() })
  assert.equal(result.statusCode, 202)
  assert.deepEqual(result.json().data, { teamId: 'team-a', seq: 1, status: 'cached' })
})

const speech = id => ({ teamId: 'team-a', command: { protocolVersion: '2.0', sceneId: 'team-a', commandId: id, type: 'activity.start', capability: 'scene.say',
  participants: [{ entityId: 'office-lead', role: 'actor' }], params: { text: '动画通道测试' } } })

test('animation-only subscribers do not make office business pages appear online', { timeout: 5000 }, async t => {
  const { app, base } = await setup(t, { officeRequestMs: 50 })
  await post(app, { type: 'offices.initialize', offices: [snapshot()] })
  const animation = await stream(t, base, 'teams=team-a')
  const updated = await post(app, { type: 'office.snapshot', teamId: 'team-a', snapshot: snapshot(2) })
  assert.equal(updated.statusCode, 202); assert.equal(updated.json().data.status, 'cached')
  assert.equal((await post(app, { type: 'offices.initialize', offices: [snapshot(2)] })).statusCode, 202)
  for (const request of [{ type: 'office.read', teamId: 'team-a' },
    { type: 'decision.request', teamId: 'team-a', timeoutMs: 1000, decision: { id: 'no-workspace', kind: 'confirmation', title: '继续吗？' } }]) {
    const result = await post(app, request)
    assert.equal(result.statusCode, 409); assert.equal(result.json().data.reasonCode, 'NO_RECEIVER')
  }
  assert.equal((await post(app, { type: 'office.read' })).json().data.offices[0].seq, 2)
  assert.equal((await post(app, speech('only-animation'))).json().data.forwarded, 1)
  assert.equal((await animation.next()).command.commandId, 'only-animation', 'business frames must never enter animation-only subscriptions')
  const workspace = await stream(t, base)
  assert.equal((await workspace.next()).snapshot.seq, 2)
})

test('mixed subscriptions send business requests and menu closure only to office workspaces, but animate both', { timeout: 5000 }, async t => {
  const { app, base } = await setup(t)
  await post(app, { type: 'offices.initialize', offices: [snapshot()] })
  const animation = await stream(t, base, 'teams=team-a'), workspace = await stream(t, base); await workspace.next()
  const changed = post(app, { type: 'office.snapshot', teamId: 'team-a', snapshot: snapshot(2) }).then(value => value)
  const update = await workspace.next()
  await app.inject({ method: 'POST', url: '/api/pixoffice/reply', payload: { responseToken: update.responseToken,
    result: { code: 200, msg: 'Applied', data: { teamId: 'team-a', seq: 2, status: 'applied' } } } })
  assert.equal((await changed).statusCode, 200)
  const pending = post(app, { type: 'decision.request', teamId: 'team-a', timeoutMs: 1000,
    decision: { id: 'workspace-only', kind: 'confirmation', title: '继续吗？' } }).then(value => value)
  const menu = await workspace.next()
  await app.inject({ method: 'POST', url: '/api/pixoffice/reply', payload: { responseToken: menu.responseToken,
    result: { code: 200, msg: 'Selected', data: { teamId: 'team-a', decisionId: 'workspace-only', choiceId: 'confirm', label: '确认' } } } })
  assert.equal((await pending).statusCode, 200)
  assert.equal((await workspace.next()).type, 'office.request.closed')
  assert.equal((await post(app, speech('both-animation'))).json().data.forwarded, 2)
  assert.equal((await animation.next()).command.commandId, 'both-animation')
  assert.equal((await workspace.next()).command.commandId, 'both-animation')
})

test('initialization retries include identical offices, add new offices and exclude stale snapshots', { timeout: 5000 }, async t => {
  const { app, base } = await setup(t)
  const current = snapshot(2), other = snapshot(3); other.workspace.id = 'team-b'
  await post(app, { type: 'offices.initialize', offices: [current, other] })
  const browser = await stream(t, base); await browser.next(); await browser.next()
  const added = snapshot(); added.workspace.id = 'team-c'
  const stale = snapshot(2); stale.workspace.id = 'team-b'
  const pending = post(app, { type: 'offices.initialize', offices: [current, stale, added] }).then(value => value)
  const delivery = await browser.next()
  assert.equal(delivery.type, 'office.request')
  assert.deepEqual(delivery.request.offices.map(item => [item.workspace.id, item.seq]), [['team-a', 2], ['team-c', 1]])
  const directory = (await post(app, { type: 'office.capabilities' })).json().data
  await app.inject({ method: 'POST', url: '/api/pixoffice/reply', payload: { responseToken: delivery.responseToken, result: { code: 200, msg: 'Initialized', data: {
    offices: [current, other, added].map(item => ({ id: item.workspace.id, name: item.workspace.name, runtimeReady: true, seq: item.seq, taskCount: 1 })),
    actors: directory.scene.actors.map(({ id, name }) => ({ id, name })), supportedMessages: [], sceneCommandProtocol: '2.0', ui: directory.ui,
  } } } })
  assert.equal((await pending).statusCode, 200)
})

test('capability discovery works before initialization and exposes roles, state and fixed UI schemas', async t => {
  const { app } = await setup(t)
  const result = await post(app, { type: 'office.capabilities' })
  assert.equal(result.statusCode, 200)
  const data = result.json().data
  assert.equal(data.scene.actors.length, 6)
  assert(data.scene.capabilities.find(item => item.id === 'office.visit').participants.roles.some(role => role.role === 'visitor'))
  assert(data.scene.objects.find(item => item.id === 'whiteboard-1').stateSchema.properties.taskBoard)
  assert(data.ui.slots.some(slot => slot.id === 'dialog')); assert(data.ui.actionSchema); assert(data.ui.whiteboardSchema)
  assert(data.responses.success.anyOf || data.responses.success.oneOf); assert(data.responses.error.properties.reasonCode)
})

test('scene validation reports the actual command field with the minimal response envelope', async t => {
  const { app } = await setup(t)
  const result = await post(app, { teamId: 'team-a', command: { protocolVersion: '2.0', sceneId: 'team-a', commandId: 'bad', type: 'activity.start', capability: 'scene.say',
    participants: [{ entityId: 'office-lead', role: 'actor' }], params: { text: '测试' }, busyPolicy: 'bad' } })
  assert.equal(result.statusCode, 400)
  assert(result.json().data.issues.some(issue => issue.path.includes('busyPolicy')))
  assert.deepEqual(Object.keys(result.json()).sort(), ['code', 'data', 'msg'])
  assert(officeErrorResultSchema.safeParse(result.json().data).success)
  const unauthorized = await app.inject({ method: 'POST', url: '/api/pixoffice/messages', payload: {} })
  assert.equal(unauthorized.statusCode, 401)
  assert(officeErrorResultSchema.safeParse(unauthorized.json().data).success)
})

test('backend receives user operations and returns fixed dialog content through the same POST endpoint', async t => {
  const { app } = await setup(t)
  await post(app, { type: 'offices.initialize', offices: [snapshot()] })
  const waiting = post(app, { type: 'ui.next', timeoutMs: 1000 }).then(value => value)
  const browser = app.inject({ method: 'POST', url: '/api/pixoffice/ui', payload: { id: 'inspect-one', teamId: 'team-a', action: 'actor.inspect', actorId: 'office-lead' } }).then(value => value)
  const action = (await waiting).json().data.actions[0]
  assert.equal(action.id, 'inspect-one'); assert.equal(action.actorId, 'office-lead')
  const presentation = { target: 'dialog', content: { template: 'detail-v1', title: '王明的任务', fields: [{ label: '任务', value: '登录开发' }], actions: [{ id: 'review', label: '提交审核' }] } }
  assert.equal((await post(app, { type: 'ui.respond', interactionId: action.id, presentation })).statusCode, 200)
  const result = await browser
  assert.equal(result.statusCode, 200); assert.equal(result.json().data.target, 'dialog')
  assert.deepEqual(Object.keys(result.json()).sort(), ['code', 'data', 'msg'])
  const late = await post(app, { type: 'ui.respond', interactionId: action.id, presentation })
  assert.equal(late.statusCode, 410)
})

test('a user action can update the whiteboard with a versioned full snapshot, without exposing internal revisions', async t => {
  const { app, base } = await setup(t)
  await post(app, { type: 'offices.initialize', offices: [snapshot()] })
  const browserStream = await stream(t, base); await browserStream.next()
  const animation = await stream(t, base, 'teams=team-a')
  const browser = app.inject({ method: 'POST', url: '/api/pixoffice/ui', payload: { id: 'inspect-board', teamId: 'team-a', action: 'actor.inspect', actorId: 'office-lead' } }).then(value => value)
  const next = await post(app, { type: 'ui.next', timeoutMs: 1000 })
  assert.equal(next.json().data.actions[0].id, 'inspect-board')
  const result = await post(app, { type: 'ui.respond', interactionId: 'inspect-board', presentation: { target: 'whiteboard', snapshot: snapshot(2) } })
  assert.equal(result.statusCode, 200); assert.equal((await browser).statusCode, 200)
  assert.equal((await browserStream.next()).snapshot.whiteboard.title, '项目 2')
  await post(app, speech('after-ui-whiteboard'))
  assert.equal((await animation.next()).command.commandId, 'after-ui-whiteboard')
})

test('invalid bindings do not contaminate cached state and snapshots require an explicit seq', async t => {
  const { app } = await setup(t)
  const invalid = snapshot(); invalid.employees[0].sceneActorId = 'missing'
  assert.equal((await post(app, { type: 'offices.initialize', offices: [invalid] })).statusCode, 422)
  const valid = snapshot(); delete valid.seq
  assert.equal((await post(app, { type: 'offices.initialize', offices: [valid] })).statusCode, 400)
  assert.equal((await post(app, { type: 'office.snapshot', teamId: 'team-a', snapshot: snapshot(2) })).statusCode, 404)
})

test('long-running menus cannot prevent latest business snapshots from reaching the browser', async t => {
  const { app, base } = await setup(t, { maxOfficeRequests: 1 })
  await post(app, { type: 'offices.initialize', offices: [snapshot()] })
  const browser = await stream(t, base); await browser.next()
  const animation = await stream(t, base, 'teams=team-a')
  const waiting = post(app, { type: 'decision.request', teamId: 'team-a', timeoutMs: 1000,
    decision: { id: 'pending-menu', kind: 'confirmation', title: '确认吗？' } }).then(value => value)
  const menu = await browser.next()
  const changed = await post(app, { type: 'office.snapshot', teamId: 'team-a', snapshot: snapshot(2) })
  assert.equal(changed.statusCode, 202)
  assert.equal((await browser.next()).snapshot.seq, 2)
  const repeated = await post(app, { type: 'office.snapshot', teamId: 'team-a', snapshot: snapshot(2) })
  assert.equal(repeated.statusCode, 202)
  assert.equal(repeated.json().data.status, 'cached')
  assert.equal((await browser.next()).snapshot.seq, 2)
  await app.inject({ method: 'POST', url: '/api/pixoffice/reply', payload: { responseToken: menu.responseToken, result: { code: 200, msg: '',
    data: { teamId: 'team-a', decisionId: 'pending-menu', choiceId: 'reject', label: '拒绝' } } } })
  assert.equal((await waiting).statusCode, 200)
  await post(app, speech('after-capacity-fallback'))
  assert.equal((await animation.next()).command.commandId, 'after-capacity-fallback')
})

test('remote office whiteboards have one authoritative update path, not a silent animation write path', async t => {
  const { app } = await setup(t)
  await post(app, { type: 'offices.initialize', offices: [snapshot()] })
  const response = await post(app, { teamId: 'team-a', command: { protocolVersion: '2.0', sceneId: 'team-a', commandId: 'old-board-write',
    type: 'object.state.set', entityId: 'whiteboard-1', expectedStateRevision: 0, state: {} } })
  assert.equal(response.statusCode, 400); assert.equal(response.json().data.reasonCode, 'SNAPSHOT_REQUIRED')
})
