import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPixOfficeServer, DEMO_API_KEY } from '../server/dist/app.js'
import { describeOfficeUi } from '@pixoffice/protocol/office-integration'

const workspace = () => ({ offices: [], actors: [], supportedMessages: [], sceneCommandProtocol: '2.0', ui: describeOfficeUi() })

const message = data => data
const state = id => ({ schemaVersion: '1.0', seq: 1, workspace: { id, name: id } })
const post = (app, value) => app.inject({ method: 'POST', url: '/api/pixoffice/messages', headers: { authorization: `Bearer ${DEMO_API_KEY}` }, payload: value })
async function setup(t, options = {}) {
  const app = await createPixOfficeServer(options), base = await app.listen({ port: 0, host: '127.0.0.1' })
  t.after(() => app.close())
  return { app, base }
}
async function subscribe(t, base, query = 'workspace=1&teams=team-a') {
  const abort = new AbortController(), response = await fetch(`${base}/api/pixoffice/events?${query}`, { signal: abort.signal })
  assert.equal(response.status, 200)
  const reader = response.body.getReader(), decoder = new TextDecoder()
  let buffer = ''
  t.after(async () => { abort.abort(); await reader.cancel().catch(() => {}) })
  return { async next() {
    for (;;) {
      const end = buffer.indexOf('\n\n')
      if (end >= 0) { const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2); if (frame.startsWith('data: ')) { const value = JSON.parse(frame.slice(6)); if (!['office.sync.start', 'office.sync.complete'].includes(value.type)) return value }; continue }
      const value = await reader.read(); if (value.done) throw new Error('SSE closed'); buffer += decoder.decode(value.value, { stream: true })
    }
  } }
}
const respond = (app, delivery, result = workspace(), code = 200) => app.inject({ method: 'POST', url: '/api/pixoffice/reply', payload: {
  responseToken: delivery.responseToken, result: { code, msg: 'OK', data: result },
} })

test('a backend initializes an empty browser and the same POST returns only after runtime initialization', async t => {
  const { app, base } = await setup(t), browser = await subscribe(t, base, 'workspace=1')
  let settled = false
  const request = post(app, message({ type: 'offices.initialize', offices: [], chat: { url: 'http://private-backend.example/chat' } })).then(value => { settled = true; return value })
  const delivery = await browser.next()
  assert.equal(delivery.type, 'office.request')
  assert.equal(Object.hasOwn(delivery.request, 'chat'), false, 'chat destinations stay on the server and are not sent over SSE')
  assert.equal(settled, false)
  assert.equal((await respond(app, delivery, workspace())).statusCode, 200)
  const result = await request
  assert.equal(result.statusCode, 200); assert.deepEqual(result.json().data.offices, [])
  assert.doesNotMatch(result.body, /private-backend/)
  assert.deepEqual(Object.keys(result.json()).sort(), ['code', 'data', 'msg'])
  assert.equal((await respond(app, delivery)).statusCode, 410, 'reply tokens cannot be reused')
})

test('the original backend request returns the validated user choice without any callback endpoint', async t => {
  const { app, base } = await setup(t), browser = await subscribe(t, base)
  const request = post(app, message({ type: 'decision.request', teamId: 'team-a', timeoutMs: 5000,
    decision: { id: 'decision-one', kind: 'confirmation', title: '提交吗？', confirmLabel: '提交', rejectLabel: '暂不提交' } })).then(value => value)
  const delivery = await browser.next()
  const invalid = await respond(app, delivery, { teamId: 'team-a', decisionId: 'decision-one', choiceId: 'unknown' })
  assert.equal(invalid.statusCode, 400)
  assert.equal((await respond(app, delivery, { teamId: 'team-a', decisionId: 'decision-one', choiceId: 'reject', label: '不可信文字' })).statusCode, 200)
  const result = await request
  assert.equal(result.statusCode, 200)
  assert.deepEqual(result.json().data, { teamId: 'team-a', decisionId: 'decision-one', choiceId: 'reject', label: '暂不提交' })
  assert.equal((await browser.next()).type, 'office.request.closed')
})

test('business timeouts return 408 and late choices cannot become approvals', async t => {
  const { app, base } = await setup(t, { officeRequestMs: 30 })
  await post(app, { type: 'offices.initialize', offices: [state('team-a')] })
  const browser = await subscribe(t, base); await browser.next()
  const request = post(app, message({ type: 'office.read', teamId: 'team-a' })).then(value => value)
  const delivery = await browser.next()
  const result = await request
  assert.equal(result.statusCode, 408)
  assert.equal(result.json().data.reasonCode, 'REQUEST_TIMEOUT')
  assert.equal((await respond(app, delivery)).statusCode, 410)
})

test('offline business requests fail immediately and bounded open requests do not become a server message queue', async t => {
  const { app, base } = await setup(t, { maxOfficeRequests: 1 })
  assert.equal((await post(app, message({ type: 'offices.initialize', offices: [state('team-a')] }))).statusCode, 202)
  const browser = await subscribe(t, base); await browser.next()
  const first = post(app, message({ type: 'office.read' })).then(value => value)
  const delivery = await browser.next()
  assert.equal((await post(app, message({ type: 'office.read' }))).statusCode, 503)
  await respond(app, delivery)
  assert.equal((await first).statusCode, 200)
})

test('browser reply rejects cross-site requests and invalid tokens without needing a backend secret', async t => {
  const { app } = await setup(t)
  const reply = { responseToken: 'unknown', result: { code: 200, msg: '', data: workspace() } }
  assert.equal((await app.inject({ method: 'POST', url: '/api/pixoffice/reply', payload: reply, headers: { origin: 'https://bad.example', 'sec-fetch-site': 'cross-site' } })).statusCode, 403)
  assert.equal((await app.inject({ method: 'POST', url: '/api/pixoffice/reply', payload: reply })).statusCode, 410)
  assert.equal((await app.inject({ method: 'POST', url: '/api/pixoffice/reply', payload: { ...reply, requestId: 'retired' } })).statusCode, 400)
  assert.equal((await app.inject('/api/pixoffice/events?workspace=2')).statusCode, 400)
})

test('business requests reject the removed envelope field instead of maintaining a compatibility path', async t => {
  const { app } = await setup(t)
  const result = await post(app, { ...message({ type: 'office.capabilities' }), requestId: 'retired' })
  assert.equal(result.statusCode, 400)
  assert.deepEqual(Object.keys(result.json()).sort(), ['code', 'data', 'msg'])
})

test('an empty parallel page cannot reject an operation handled by an initialized page', async t => {
  const { app, base } = await setup(t)
  await post(app, { type: 'offices.initialize', offices: [state('team-a')] })
  const empty = await subscribe(t, base, 'workspace=1'), ready = await subscribe(t, base, 'workspace=1')
  await empty.next(); await ready.next()
  const request = post(app, message({ type: 'office.read', teamId: 'team-a' })).then(value => value)
  const rejected = await empty.next(), accepted = await ready.next()
  await respond(app, rejected, { reasonCode: 'OFFICE_NOT_INITIALIZED' }, 404)
  const capabilities = await post(app, message({ type: 'office.capabilities' }))
  await respond(app, accepted, { snapshot: { schemaVersion: '1.0', seq: 1, whiteboard: { template: 'task-board-v1', title: '', status: 'queued', steps: [] }, workspace: { id: 'team-a', name: 'ready-page' }, employees: [], tasks: [], events: [] },
    scene: capabilities.json().data.scene, pendingDecisions: [] })
  const response = await request
  assert.equal(response.statusCode, 200)
  assert.equal(response.json().data.snapshot.workspace.name, 'ready-page')
})

test('concurrent requests receive their own results through internal tokens, even when replies arrive out of order', async t => {
  const { app, base } = await setup(t)
  await post(app, { type: 'offices.initialize', offices: [state('team-a'), state('team-b')] })
  const browser = await subscribe(t, base); await browser.next(); await browser.next()
  const requestA = post(app, message({ type: 'office.read', teamId: 'team-a' })).then(value => value)
  const requestB = post(app, message({ type: 'office.read', teamId: 'team-b' })).then(value => value)
  const deliveries = [await browser.next(), await browser.next()]
  assert.notEqual(deliveries[0].responseToken, deliveries[1].responseToken)
  const capabilities = await post(app, message({ type: 'office.capabilities' }))
  for (const delivery of deliveries.reverse()) {
    assert.deepEqual(Object.keys(delivery).sort(), ['remainingMs', 'request', 'responseToken', 'type'])
    const id = delivery.request.teamId
    assert.equal((await respond(app, delivery, {
      snapshot: { schemaVersion: '1.0', seq: 1, whiteboard: { template: 'task-board-v1', title: '', status: 'queued', steps: [] }, workspace: { id, name: id }, employees: [], tasks: [], events: [] },
      scene: { ...capabilities.json().data.scene, sceneId: id }, pendingDecisions: [],
    })).statusCode, 200)
  }
  assert.equal((await requestA).json().data.snapshot.workspace.id, 'team-a')
  assert.equal((await requestB).json().data.snapshot.workspace.id, 'team-b')
})

test('directory results use server-owned offices and only confirm the exact browser version', async t => {
  const { app, base } = await setup(t)
  await post(app, { type: 'offices.initialize', offices: [state('team-a')] })
  const browser = await subscribe(t, base); await browser.next()
  const request = post(app, { type: 'office.read' }).then(value => value), delivery = await browser.next()
  await respond(app, delivery, { ...workspace(), offices: [
    { id: 'team-a', name: '旧名称', seq: 9, runtimeReady: true, taskCount: 99 },
    { id: 'stale-cache', name: '旧缓存办公室', seq: 4, runtimeReady: true, taskCount: 1 },
  ] })
  const result = await request
  assert.deepEqual(result.json().data.offices, [{ id: 'team-a', name: 'team-a', seq: 1, runtimeReady: false, taskCount: 0 }])
  assert.equal((await post(app, { type: 'office.read', teamId: 'stale-cache' })).statusCode, 404)
})
