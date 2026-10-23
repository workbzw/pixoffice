import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { createTestServer } from './helpers/vite.mjs'
import { createPixOfficeServer, DEMO_API_KEY } from '../server/dist/app.js'

let server, OfficeIntegrationSession, OfficeTeamSession, createOfficeRuntime, schemas
before(async () => {
  server = await createTestServer()
  ;({ OfficeIntegrationSession } = await server.ssrLoadModule('/example/office-web/src/application/OfficeIntegrationSession.ts'))
  ;({ OfficeTeamSession } = await server.ssrLoadModule('/example/office-web/src/application/OfficeTeamSession.ts'))
  ;({ createOfficeRuntime } = await server.ssrLoadModule('/example/office-web/src/application/createOfficeRuntime.ts'))
  schemas = await server.ssrLoadModule('@pixoffice/protocol/office-integration')
})
after(() => server?.close())
const flush = async () => { for (let i = 0; i < 80; i++) await Promise.resolve() }
async function waitFor(predicate, message) {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await delay(1) }
  assert.fail(message)
}
const syncStart = stateId => ({ type: 'office.sync.start', stateId, layout: { currentLayoutId: 'classic', revision: 0 } })
const snapshot = (id = 'team-a') => ({ schemaVersion: '1.0', seq: 1, workspace: { id, name: id }, conversations: [{ id: 'main', title: '主会话', whiteboard: { template: 'task-board-v1', title: '', status: 'queued', steps: [] }, employees: [
  { id: 'coding', sceneActorId: 'office-lead', name: '开发功能' }, { id: 'testing', sceneActorId: 'office-lead', name: '测试功能' },
], tasks: [{ id: 'task-one', title: '登录开发', assigneeId: 'coding', status: 'running', progress: 25, summary: '实现接口', updatedAt: '2026-10-18T10:00:00Z' }], events: [] }] })
const delivery = (id, request, remainingMs = 10000) => ({ type: 'office.request', responseToken: `reply-${id}`, remainingMs, request })

async function setup(t, overrides = {}) {
  const connections = [], replies = [], runtimes = []
  const integration = new OfficeIntegrationSession({ transport: { connect(options) { connections.push(options); return () => {} } },
    reply: async reply => { replies.push(reply) }, createSession: (source, sceneId) => {
      const runtime = createOfficeRuntime({ sceneId, referenceLayout: true }); runtimes.push(runtime)
      return new OfficeTeamSession(runtime, source)
    }, ...overrides })
  t.after(() => { integration.stop(); runtimes.forEach(runtime => runtime.dispose()) })
  await integration.start()
  const send = async (id, request, remainingMs) => { integration.receive(delivery(id, request, remainingMs)); await flush(); return replies.find(reply => reply.responseToken === `reply-${id}`) }
  return { integration, connections, replies, runtimes, send }
}

async function connectedBrowser(t, app, base, overrides = {}) {
  const receipts = [], linked = await setup(t, { ...overrides, reply: async value => {
    if (overrides.replyDelay) await delay(overrides.replyDelay)
    const response = await app.inject({ method: 'POST', url: '/api/pixoffice/reply', payload: value })
    receipts.push(response.statusCode)
    if (response.statusCode !== 200) throw Object.assign(new Error(`Result failed (${response.statusCode})`), { status: response.statusCode })
  } })
  const controller = new AbortController(), response = await fetch(`${base}/api/pixoffice/events?workspace=1`, { signal: controller.signal })
  assert.equal(response.status, 200)
  const reader = response.body.getReader(), decoder = new TextDecoder()
  linked.connections[0].onStatus('已连接')
  let buffer = '', streamError, synced = false
  const pump = (async () => {
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) return
      buffer += decoder.decode(chunk.value, { stream: true })
      let end
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2)
        if (!frame.startsWith('data: ')) continue
        const value = JSON.parse(frame.slice(6))
        linked.connections[0].onMessage(value)
        await flush()
        if (value.type === 'office.sync.complete') synced = true
      }
    }
  })().catch(error => { if (!controller.signal.aborted) streamError = error })
  const close = async () => { controller.abort(); await reader.cancel().catch(() => {}); await pump; linked.integration.stop() }
  t.after(close)
  for (let i = 0; i < 200 && !synced && !streamError; i++) await delay(5)
  assert.equal(streamError, undefined); assert.equal(synced, true)
  return { ...linked, receipts, close }
}

test('chat notifications refresh only the addressed conversation and reconnection recovers missed history', { timeout: 10000 }, async t => {
  const app = await createPixOfficeServer(), base = await app.listen({ host: '127.0.0.1', port: 0 })
  t.after(() => app.close())
  const replies = new Map(), reads = []
  const source = { kind: 'remote-test', async *stream() {}, history: async ({ teamId, conversationId }) => {
    const key = `${teamId}/${conversationId}`; reads.push(key)
    return { turns: replies.has(key) ? [{ id: 'turn', user: '问题', assistant: replies.get(key), state: 'complete', error: '' }] : [], nextCursor: '', hasMore: false, activeTurnId: '' }
  } }
  const runtimes = []
  t.after(() => runtimes.forEach(runtime => runtime.dispose()))
  const browser = await connectedBrowser(t, app, base, { createSession: (data, sceneId) => {
    const runtime = createOfficeRuntime({ sceneId, referenceLayout: true }); runtimes.push(runtime)
    return new OfficeTeamSession(runtime, data, { chatSource: source })
  } })
  const value = snapshot(), other = structuredClone(value.conversations[0]); other.id = 'other'; other.title = '另一会话'; value.conversations.push(other)
  const post = payload => app.inject({ method: 'POST', url: '/api/pixoffice/messages', headers: { authorization: `Bearer ${DEMO_API_KEY}` }, payload })
  assert.equal((await post({ type: 'offices.initialize', offices: [value, snapshot('team-b')], chat: { url: 'https://chat.example/api' } })).statusCode, 200)
  const offices = browser.integration.getSnapshot().offices, chat = offices[0].session.chat
  await chat.selected.synchronize(true)
  await offices[1].session.chat.selected.synchronize(true)
  chat.selected.setDraft('不能丢失的草稿')
  const unrelatedReads = reads.filter(key => key === 'team-b/main').length
  replies.set('team-a/main', '新的主动汇报')
  assert.equal((await post({ type: 'chat.updated', teamId: 'team-a', conversationId: 'main' })).statusCode, 200)
  await waitFor(() => chat.selected.getSnapshot().messages.at(-1)?.content === '新的主动汇报', 'chat did not refresh from the notification')
  assert.equal(chat.selected.getSnapshot().draft, '不能丢失的草稿')
  assert.equal(reads.filter(key => key === 'team-b/main').length, unrelatedReads)
  replies.set('team-a/other', '后台会话的汇报')
  await post({ type: 'chat.updated', teamId: 'team-a', conversationId: 'other' }); await flush()
  assert(!reads.includes('team-a/other'), 'an unopened conversation must not trigger an unnecessary history request')
  chat.select('other')
  await waitFor(() => chat.selected.getSnapshot().messages.at(-1)?.content === '后台会话的汇报', 'background conversation did not refresh on selection')
  browser.connections[0].onStatus('重连中')
  replies.set('team-a/other', '断线期间已经更新')
  browser.connections[0].onStatus('已连接')
  browser.integration.receive({ type: 'office.sync.complete', offices: [{ teamId: 'team-a', seq: 1 }, { teamId: 'team-b', seq: 1 }] })
  await waitFor(() => chat.selected.getSnapshot().messages.at(-1)?.content === '断线期间已经更新', 'reconnection did not resync missed chat updates')
  assert.deepEqual(browser.receipts, [200], 'chat updates must not produce business reply acknowledgements')
})

test('member statistics survive HTTP delivery, conversation switching and a late browser joining', { timeout: 5000 }, async t => {
  const app = await createPixOfficeServer(), base = await app.listen({ host: '127.0.0.1', port: 0 })
  t.after(() => app.close())
  const first = await connectedBrowser(t, app, base)
  const value = snapshot()
  const history = completed => ({ scope: 'conversation', updatedAt: '2026-10-22T02:00:00Z', periods: [{
    id: 'last7Days', label: '近 7 天', metrics: [{ id: 'completed', label: '完成', value: completed, unit: '项' }], blocks: [],
  }] })
  value.conversations[0].employees[0].insights = history(7)
  value.conversations.push({ ...structuredClone(value.conversations[0]), id: 'other', title: '另一会话' })
  value.conversations[1].employees[0].insights = history(30)
  const post = payload => app.inject({ method: 'POST', url: '/api/pixoffice/messages', headers: { authorization: `Bearer ${DEMO_API_KEY}` }, payload })
  assert.equal((await post({ type: 'offices.initialize', offices: [value] })).statusCode, 200)
  const source = first.integration.getSnapshot().offices[0].source
  assert.equal((await source.getSnapshot()).employees[0].insights.periods[0].metrics[0].value, 7)
  source.selectConversation('other')
  assert.equal((await source.getSnapshot()).employees[0].insights.periods[0].metrics[0].value, 30)
  const late = await connectedBrowser(t, app, base)
  const recovered = late.integration.getSnapshot().offices[0].source.readSnapshot()
  assert.equal(recovered.conversations[0].employees[0].insights.periods[0].metrics[0].value, 7)
  assert.equal(recovered.conversations[1].employees[0].insights.periods[0].metrics[0].value, 30)
  assert.equal(recovered.conversations[0].employees[1].insights, undefined, 'no statistics are invented for an unreported member')
})

test('full discovery accepts live runtime receipts larger than one scene event without echoing capability schemas', { timeout: 10000 }, async t => {
  const app = await createPixOfficeServer(), base = await app.listen({ host: '127.0.0.1', port: 0 })
  t.after(() => app.close())
  const post = payload => app.inject({ method: 'POST', url: '/api/pixoffice/messages', headers: { authorization: `Bearer ${DEMO_API_KEY}` }, payload })
  for (let i = 0; i < 20; i++) {
    const value = snapshot(`team-${i}`)
    value.conversations[0].whiteboard = { title: '完整业务内容', link: { label: '资料', url: `https://example.com/${'a'.repeat(30000)}` } }
    assert.equal((await post({ type: 'offices.initialize', offices: [value] })).statusCode, 202)
  }
  const browser = await connectedBrowser(t, app, base)
  const response = await post({ type: 'office.read' })
  assert.equal(response.statusCode, 200)
  const offices = response.json().data.state.offices
  assert.equal(offices.length, 20); assert(offices.every(office => office.runtime.available))
  assert(Buffer.byteLength(JSON.stringify(offices.map(office => office.runtime))) > 524288)
  assert.deepEqual(browser.receipts, [200])
})

test('backend layout selection initializes and switches connected pages without recreating business sessions', { timeout: 10000 }, async t => {
  const app = await createPixOfficeServer(), base = await app.listen({ host: '127.0.0.1', port: 0 })
  t.after(() => app.close())
  const first = await connectedBrowser(t, app, base), second = await connectedBrowser(t, app, base)
  const post = payload => app.inject({ method: 'POST', url: '/api/pixoffice/messages', headers: { authorization: `Bearer ${DEMO_API_KEY}` }, payload })
  const initialized = await post({ type: 'offices.initialize', offices: [snapshot()], layoutId: 'members' })
  assert.equal(initialized.statusCode, 200)
  assert.equal(initialized.json().data.state.layout.currentLayoutId, 'members')
  await waitFor(() => second.integration.getSnapshot().offices.length === 1, 'second page did not initialize')
  const office = first.integration.getSnapshot().offices[0], runtime = office.session.runtime, chat = office.session.chat
  await chat.ready; await chat.selected.ready
  chat.selected.setDraft('保留中的草稿')
  const chatSession = chat.selected, sceneId = runtime.sceneId
  runtime.submit({ protocolVersion: '2.0', sceneId, commandId: 'layout-does-not-interrupt', type: 'activity.start', capability: 'scene.say',
    participants: [{ entityId: 'office-lead', role: 'actor' }], params: { text: '继续执行', durationMs: 30000 } })
  const changed = await post({ type: 'office.layout.set', layoutId: 'classic' })
  assert.equal(changed.statusCode, 200)
  assert.equal(changed.json().data.currentLayoutId, 'classic')
  await waitFor(() => second.integration.getSnapshot().layout.currentLayoutId === 'classic', 'other page did not switch')
  assert.equal(first.integration.getSnapshot().offices[0].session, office.session)
  assert.equal(first.integration.getSnapshot().offices[0].session.runtime, runtime)
  assert.equal(runtime.getRecord('layout-does-not-interrupt').status, 'running')
  assert.equal(chat.selected, chatSession); assert.equal(chatSession.getSnapshot().draft, '保留中的草稿')
  const next = snapshot(); next.seq = 2; next.conversations[0].tasks[0].status = 'completed'
  assert.equal((await post({ type: 'office.snapshot', teamId: 'team-a', snapshot: next })).statusCode, 200)
  assert.equal(first.integration.getSnapshot().layout.currentLayoutId, 'classic')
  const switchedInBrowser = await app.inject({ method: 'POST', url: '/api/pixoffice/layout', payload: { type: 'office.layout.set', layoutId: 'members' } })
  assert.equal(switchedInBrowser.statusCode, 200)
  await waitFor(() => first.integration.getSnapshot().layout.currentLayoutId === 'members' && second.integration.getSnapshot().layout.currentLayoutId === 'members', 'browser choice was not shared')
  assert.equal((await post({ type: 'office.layout.read' })).json().data.currentLayoutId, 'members')
  assert.equal(first.integration.getSnapshot().offices[0].source.readSnapshot().seq, 2)
})

test('a late joining page restores an offline layout selection without an office initialization request', { timeout: 5000 }, async t => {
  const app = await createPixOfficeServer(), base = await app.listen({ host: '127.0.0.1', port: 0 })
  t.after(() => app.close())
  const post = payload => app.inject({ method: 'POST', url: '/api/pixoffice/messages', headers: { authorization: `Bearer ${DEMO_API_KEY}` }, payload })
  assert.equal((await post({ type: 'office.layout.set', layoutId: 'members' })).statusCode, 202)
  const browser = await connectedBrowser(t, app, base)
  assert.deepEqual(browser.integration.getSnapshot().layout, { currentLayoutId: 'members', revision: 1 })
  assert.equal(browser.integration.getSnapshot().offices.length, 0)
  assert.equal((await post({ type: 'office.layout.set', layoutId: 'classic' })).statusCode, 200)
  assert.equal(browser.integration.getSnapshot().layout.currentLayoutId, 'classic')
})

test('layout ordering, cache recovery and server replacement use server-owned revisions', async t => {
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const { integration } = await setup(t, { storage })
  integration.receive(syncStart('server-a')); await flush()
  integration.receive({ type: 'office.layout.sync', layout: { currentLayoutId: 'members', revision: 3 } })
  integration.receive({ type: 'office.layout.sync', layout: { currentLayoutId: 'classic', revision: 2 } })
  await flush()
  assert.deepEqual(integration.getSnapshot().layout, { currentLayoutId: 'members', revision: 3 })
  integration.stop()
  const restored = await setup(t, { storage })
  assert.deepEqual(restored.integration.getSnapshot().layout, { currentLayoutId: 'members', revision: 3 })
  restored.integration.receive(syncStart('server-b')); await flush()
  assert.deepEqual(restored.integration.getSnapshot().layout, { currentLayoutId: 'classic', revision: 0 })
})

test('a delayed browser selection response cannot overwrite a newer backend selection', async t => {
  let finish, calls = 0
  const { integration } = await setup(t, { changeLayout: () => { calls++; return new Promise(resolve => { finish = resolve }) } })
  const pending = integration.selectLayout('members')
  assert.equal(integration.getSnapshot().layoutBusy, true)
  await integration.selectLayout('classic'); assert.equal(calls, 1)
  integration.receive({ type: 'office.layout.sync', layout: { currentLayoutId: 'classic', revision: 2 } }); await flush()
  finish({ currentLayoutId: 'members', revision: 1 }); await pending
  assert.deepEqual(integration.getSnapshot().layout, { currentLayoutId: 'classic', revision: 2 })
  assert.equal(integration.getSnapshot().layoutBusy, false)
  assert.equal(integration.getSnapshot().error, null)
})

test('failed layout changes keep the previous selection and release the busy state', async t => {
  const { integration } = await setup(t, { changeLayout: async () => { throw new Error('network unavailable') } })
  await integration.selectLayout('members')
  assert.equal(integration.getSnapshot().layout.currentLayoutId, 'classic')
  assert.equal(integration.getSnapshot().layoutBusy, false)
  assert.match(integration.getSnapshot().error, /network unavailable/)
})

test('a layout response from a replaced server cannot overwrite the new server selection', async t => {
  const finishes = []
  const { integration } = await setup(t, { changeLayout: () => new Promise(resolve => { finishes.push(resolve) }) })
  integration.receive(syncStart('old-server')); await flush()
  const pending = integration.selectLayout('members')
  integration.receive(syncStart('new-server')); await flush()
  const next = integration.selectLayout('members')
  finishes[0]({ currentLayoutId: 'members', revision: 10 }); await pending
  assert.deepEqual(integration.getSnapshot().layout, { currentLayoutId: 'classic', revision: 0 })
  assert.equal(integration.getSnapshot().layoutBusy, true, 'an old completion must not clear a new request busy state')
  finishes[1]({ currentLayoutId: 'members', revision: 1 }); await next
  assert.deepEqual(integration.getSnapshot().layout, { currentLayoutId: 'members', revision: 1 })
  assert.equal(integration.getSnapshot().layoutBusy, false)
})

test('conflicting layout versions trigger recovery and accept the authoritative reconnect selection', async t => {
  const { integration, connections } = await setup(t)
  integration.receive(syncStart('same-server')); await flush()
  integration.receive({ type: 'office.layout.sync', layout: { currentLayoutId: 'members', revision: 1 } }); await flush()
  integration.receive({ type: 'office.layout.sync', layout: { currentLayoutId: 'classic', revision: 1 } }); await flush()
  assert.equal(connections.length, 2)
  connections[1].onMessage({ ...syncStart('same-server'), layout: { currentLayoutId: 'classic', revision: 1 } }); await flush()
  assert.deepEqual(integration.getSnapshot().layout, { currentLayoutId: 'classic', revision: 1 })
  assert.equal(integration.getSnapshot().error, null)
})

test('parallel office pages apply state without treating a closed duplicate reply as a page error', { timeout: 5000 }, async t => {
  const app = await createPixOfficeServer(), base = await app.listen({ host: '127.0.0.1', port: 0 })
  t.after(() => app.close())
  const fast = await connectedBrowser(t, app, base), slow = await connectedBrowser(t, app, base, { replyDelay: 30 })
  const post = payload => app.inject({ method: 'POST', url: '/api/pixoffice/messages', headers: { authorization: `Bearer ${DEMO_API_KEY}` }, payload })
  assert.equal((await post({ type: 'offices.initialize', offices: [snapshot()] })).statusCode, 200)
  const next = snapshot(); next.seq = 2; next.conversations[0].tasks[0].status = 'completed'
  assert.equal((await post({ type: 'office.snapshot', teamId: 'team-a', snapshot: next })).statusCode, 200)
  for (let i = 0; i < 100 && slow.receipts.length < 2; i++) await delay(5)
  assert.deepEqual(slow.receipts, [410, 410])
  for (const browser of [fast, slow]) {
    assert.equal(browser.integration.getSnapshot().error, null)
    assert.equal(browser.integration.getSnapshot().offices[0].source.readSnapshot().seq, 2)
  }
})

test('server restart replaces cached office ownership and accepts a fresh sequence for the same office', { timeout: 5000 }, async t => {
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const old = await createPixOfficeServer(), oldBase = await old.listen({ host: '127.0.0.1', port: 0 })
  t.after(() => old.close())
  const first = await connectedBrowser(t, old, oldBase, { storage })
  const post = (app, payload) => app.inject({ method: 'POST', url: '/api/pixoffice/messages', headers: { authorization: `Bearer ${DEMO_API_KEY}` }, payload })
  const original = snapshot(); original.seq = 5
  assert.equal((await post(old, { type: 'offices.initialize', offices: [original, snapshot('obsolete')] })).statusCode, 200)
  await first.close(); await old.close()
  const app = await createPixOfficeServer(), base = await app.listen({ host: '127.0.0.1', port: 0 })
  t.after(() => app.close())
  const current = await connectedBrowser(t, app, base, { storage })
  assert.equal(current.integration.getSnapshot().offices.length, 0)
  assert.deepEqual((await post(app, { type: 'office.read' })).json().data.state.offices, [])
  assert.equal((await post(app, { type: 'office.read', teamId: 'team-a' })).statusCode, 404)
  const fresh = snapshot(); fresh.conversations[0].tasks[0].title = '服务重启后的任务'
  const initialized = await post(app, { type: 'offices.initialize', offices: [fresh] })
  assert.equal(initialized.statusCode, 200)
  assert.deepEqual(initialized.json().data.state.offices.map(office => office.snapshot.workspace.id), ['team-a'])
  assert.equal(current.integration.getSnapshot().offices[0].source.readSnapshot().seq, 1)
  assert.equal(current.integration.getSnapshot().offices[0].source.readSnapshot().conversations[0].tasks[0].title, '服务重启后的任务')
  const cached = JSON.parse([...values.values()][0])
  assert.equal(cached.offices.length, 1); assert.equal(cached.offices[0].seq, 1)
})

test('normal reconnection preserves live runtimes while server directory reconciliation removes absent cache entries', async t => {
  const { integration, connections, send } = await setup(t)
  connections[0].onStatus('已连接')
  integration.receive(syncStart('same-server')); await flush()
  await send('init', { type: 'offices.initialize', offices: [snapshot(), snapshot('extra')] })
  const runtime = integration.getSnapshot().offices[0].session.runtime
  runtime.submit({ protocolVersion: '2.0', sceneId: 'team-a', commandId: 'during-reconnect', type: 'activity.start', capability: 'scene.say',
    participants: [{ entityId: 'office-lead', role: 'actor' }], params: { text: '继续工作', durationMs: 30000 } })
  integration.receive(syncStart('same-server'))
  integration.receive({ type: 'office.sync', snapshot: schemas.officeSnapshotSchema.parse(snapshot()) })
  integration.receive({ type: 'office.sync.complete', offices: [{ teamId: 'team-a', seq: 1 }] })
  await flush()
  assert.equal(integration.getSnapshot().offices.length, 1)
  assert.equal(integration.getSnapshot().offices[0].session.runtime, runtime)
  assert.equal(runtime.getRecord('during-reconnect').status, 'running')
})

for (const offset of [-120000, 120000]) test(`business requests and menu expiry tolerate a browser wall-clock offset of ${offset}ms`, async t => {
  const { integration, send } = await setup(t), now = Date.now
  t.mock.method(Date, 'now', () => now() + offset)
  assert.equal((await send('init', { type: 'offices.initialize', offices: [snapshot()] })).result.code, 200)
  await send('menu', { conversationId: 'main', type: 'decision.request', teamId: 'team-a', timeoutMs: 1000,
    decision: { id: 'clock-safe', kind: 'confirmation', title: '确认吗？' } }, 1000)
  const decisions = integration.getSnapshot().offices[0].session.decisions, request = decisions.getSnapshot().pending[0]
  assert(request.deadline - performance.now() > 500)
  assert(Math.abs(request.expiresAt - Date.now() - 1000) < 100)
  t.mock.method(Date, 'now', () => now() + offset + 3600000)
  assert.equal((await decisions.choose('team-a', 'clock-safe', 'confirm')).choiceId, 'confirm', 'wall-clock changes cannot expire a valid choice')
})

test('monotonic request expiry still closes menus and rejects business work after its time budget', async t => {
  const { integration, send, replies } = await setup(t)
  await send('expired', { type: 'offices.initialize', offices: [snapshot('expired')] }, 0)
  assert.equal(integration.getSnapshot().offices.length, 0); assert.equal(replies.length, 0)
  await send('init', { type: 'offices.initialize', offices: [snapshot()] })
  await send('menu', { conversationId: 'main', type: 'decision.request', teamId: 'team-a', timeoutMs: 1000,
    decision: { id: 'short', kind: 'confirmation', title: '确认吗？' } }, 1000)
  const decisions = integration.getSnapshot().offices[0].session.decisions, deadline = decisions.getSnapshot().pending[0].deadline
  t.mock.method(performance, 'now', () => deadline + 1)
  assert.equal(await decisions.choose('team-a', 'short', 'confirm'), null)
  assert.equal(decisions.getSnapshot().records.length, 0)
})

test('ordinary result delivery still reports real network failures', async t => {
  const { integration, send } = await setup(t, { reply: async () => { throw new Error('network unavailable') } })
  await send('init', { type: 'offices.initialize', offices: [snapshot()] })
  assert.match(integration.getSnapshot().error, /network unavailable/)
})

test('business contract validates office identity, shared bindings and decision options', () => {
  const value = { type: 'offices.initialize', offices: [snapshot()] }
  assert.doesNotThrow(() => schemas.officeMessageSchema.parse(value))
  assert.throws(() => schemas.officeMessageSchema.parse({ ...value, requestId: 'retired' }))
  assert.throws(() => schemas.officeMessageSchema.parse({ ...value, offices: [snapshot(), snapshot()] }))
  assert.throws(() => schemas.officeMessageSchema.parse({ type: 'office.snapshot', teamId: 'wrong', snapshot: snapshot() }))
  const invalid = snapshot(); invalid.workspace.id = 'bad office'
  assert.throws(() => schemas.officeMessageSchema.parse({ ...value, offices: [invalid] }))
})

test('an empty workspace listens before office IDs exist and initializes fixed actors with shared functions', async t => {
  const { integration, connections, send } = await setup(t)
  assert.deepEqual(connections[0].teamIds, [])
  assert.equal(connections[0].workspace, true)
  const result = await send('init', { type: 'offices.initialize', offices: [snapshot()] })
  assert.equal(result.result.code, 200)
  assert.equal(result.result.data.offices[0].runtime.available, true)
  const office = integration.getSnapshot().offices[0]
  assert.equal(office.session.runtime.readActors().length, 6)
  assert.equal(office.session.getSnapshot().dashboard.employees.length, 2)
  assert.equal(office.session.runtime.readActors()[0].presentation.title, '登录开发')
  assert.equal(connections.length, 1, 'initialization must not create an SSE reconnection gap')
  assert.equal(office.source.canExecute, false)
  await assert.rejects(office.source.execute({ type: 'task.start', taskId: 'task-one' }), /后端维护/)
})

for (const [name, change] of [
  ['unbound member', value => { delete value.conversations[0].employees[0].sceneActorId }],
  ['unassigned task', value => { delete value.conversations[0].tasks[0].assigneeId }],
  ['plain note', value => { value.conversations[0].events = [{ id: 'note', kind: 'note', summary: '项目动态', occurredAt: '2026-10-18T10:00:00Z' }] }],
  ['explicit empty references', value => {
    value.conversations[0].employees[0].sceneActorId = ''; value.conversations[0].tasks[0].assigneeId = ''
    value.conversations[0].events = [{ id: 'note', kind: 'note', taskId: '', employeeId: '', fromEmployeeId: '', summary: '项目动态', occurredAt: '2026-10-18T10:00:00Z' }]
  }],
]) test(`normalized ${name} survives initialization, updates and browser-cache recovery`, async t => {
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const first = await setup(t, { storage }), value = snapshot(); change(value)
  assert.equal((await first.send('init', { type: 'offices.initialize', offices: [value] })).result.code, 200)
  value.seq = 2; value.conversations[0].whiteboard.title = '最新白板'
  const changed = await first.send('update', { type: 'office.snapshot', teamId: 'team-a', snapshot: value })
  assert.equal(changed.result.code, 200); assert.equal(changed.result.data.status, 'applied')
  const expected = first.integration.getSnapshot().offices[0].source.readSnapshot()
  assert.equal(first.integration.getSnapshot().offices[0].session.getSnapshot().dashboardError, null)
  first.integration.stop()
  const restored = await setup(t, { storage }), office = restored.integration.getSnapshot().offices[0]
  assert.equal(office.session.runtime.readActors().length, 6)
  assert.deepEqual(office.source.readSnapshot(), expected)
  assert.equal(office.session.getSnapshot().dashboardError, null)
  assert.equal(office.session.runtime.readWorld().props.find(prop => prop.id === 'whiteboard-1').state.taskBoard.title, '最新白板')
})

test('external HTTP snapshots with omitted references complete through SSE, the real office session and HTTP replies', { timeout: 10000 }, async t => {
  const app = await createPixOfficeServer(), base = await app.listen({ host: '127.0.0.1', port: 0 })
  t.after(() => app.close())
  const { integration, connections } = await setup(t, { reply: async value => {
    const response = await app.inject({ method: 'POST', url: '/api/pixoffice/reply', payload: value })
    assert.equal(response.statusCode, 200)
  } })
  const controller = new AbortController(), response = await fetch(`${base}/api/pixoffice/events?workspace=1`, { signal: controller.signal })
  assert.equal(response.status, 200)
  const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '', streamError
  connections[0].onStatus('已连接')
  const pump = (async () => {
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) return
      buffer += decoder.decode(chunk.value, { stream: true })
      let boundary
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2)
        if (frame.startsWith('data: ')) connections[0].onMessage(JSON.parse(frame.slice(6)))
      }
    }
  })().catch(error => { if (!controller.signal.aborted) streamError = error })
  t.after(async () => { controller.abort(); await reader.cancel().catch(() => {}); await pump })
  const post = value => app.inject({ method: 'POST', url: '/api/pixoffice/messages', headers: { authorization: `Bearer ${DEMO_API_KEY}` }, payload: value })
  const value = snapshot()
  delete value.conversations[0].employees[0].sceneActorId; delete value.conversations[0].tasks[0].assigneeId
  value.conversations[0].events = [{ id: 'note', kind: 'note', summary: '普通动态', occurredAt: '2026-10-18T10:00:00Z' }]
  assert.equal((await post({ type: 'offices.initialize', offices: [value] })).statusCode, 200)
  value.seq = 2; value.conversations[0].whiteboard.title = '联调白板'
  const changed = await post({ type: 'office.snapshot', teamId: 'team-a', snapshot: value })
  assert.equal(changed.statusCode, 200); assert.equal(changed.json().data.status, 'applied')
  const read = await post({ type: 'office.read', teamId: 'team-a' })
  assert.equal(read.statusCode, 200)
  assert.equal(read.json().data.snapshot.conversations[0].employees[0].sceneActorId, '')
  assert.equal(read.json().data.snapshot.conversations[0].tasks[0].assigneeId, '')
  assert.equal(read.json().data.snapshot.conversations[0].events[0].fromEmployeeId, '')
  assert.equal(integration.getSnapshot().offices[0].session.runtime.readWorld().props.find(prop => prop.id === 'whiteboard-1').state.taskBoard.title, '联调白板')
  assert.equal(streamError, undefined)
})

test('adding or reinitializing offices preserves existing runtime, running actions and task state', async t => {
  const { integration, send } = await setup(t)
  await send('init', { type: 'offices.initialize', offices: [snapshot()] })
  const runtime = integration.getSnapshot().offices[0].session.runtime
  runtime.submit({ protocolVersion: '2.0', sceneId: 'team-a', commandId: 'speech', type: 'activity.start', capability: 'scene.say',
    participants: [{ entityId: 'office-lead', role: 'actor' }], params: { text: '处理中', durationMs: 30000 } })
  assert.equal(runtime.getRecord('speech').status, 'running')
  await send('add', { type: 'offices.initialize', offices: [snapshot('team-b')] })
  assert.equal(integration.getSnapshot().offices[0].session.runtime, runtime)
  assert.equal(runtime.getRecord('speech').status, 'running')
  await send('repeat', { type: 'offices.initialize', offices: [snapshot()] })
  assert.equal(integration.getSnapshot().offices[0].session.runtime, runtime)
  assert.equal(runtime.getRecord('speech').status, 'running')
  assert.equal(integration.getSnapshot().offices.length, 2)
})

test('task snapshots drive completed state without removing the actor and read returns authoritative tasks', async t => {
  const { integration, send } = await setup(t)
  await send('init', { type: 'offices.initialize', offices: [snapshot()] })
  const next = snapshot(); next.seq = 2; next.conversations[0].tasks[0].status = 'completed'; next.conversations[0].tasks[0].progress = 100
  assert.equal((await send('done', { type: 'office.snapshot', teamId: 'team-a', snapshot: next })).result.code, 200)
  const office = integration.getSnapshot().offices[0]
  assert.equal(office.session.runtime.readActors()[0].presentation.status, 'idle')
  const result = await send('read', { type: 'office.read', teamId: 'team-a' })
  assert.equal(result.result.data.seq, 2)
  assert.equal(result.result.data.runtime.available, true)
  assert.equal(office.session.runtime.readActors().length, 6)
  assert.equal((await send('missing', { type: 'office.read', teamId: 'missing' })).result.code, 404)
})

test('invalid initialization is atomic and cannot overwrite a healthy office before rejecting a bad binding', async t => {
  const { integration, send } = await setup(t)
  await send('init', { type: 'offices.initialize', offices: [snapshot()] })
  const before = integration.getSnapshot().offices[0].source.readSnapshot()
  const changed = snapshot(); changed.seq = 2; changed.conversations[0].tasks[0].title = '不应写入'
  const bad = snapshot('bad'); bad.conversations[0].employees[0].sceneActorId = 'missing'
  assert.equal((await send('invalid', { type: 'offices.initialize', offices: [changed, bad] })).result.code, 422)
  assert.deepEqual(integration.getSnapshot().offices[0].source.readSnapshot(), before)
  assert.equal(integration.getSnapshot().offices.length, 1)
})

test('user choices are returned once and are not locally recorded until delivery succeeds', async t => {
  const { integration, send, replies } = await setup(t)
  await send('init', { type: 'offices.initialize', offices: [snapshot()] })
  const decision = { id: 'approval', actorId: 'office-lead', kind: 'confirmation', title: '是否提交？', description: '核验结果', confirmLabel: '提交', rejectLabel: '拒绝' }
  assert.equal(await send('decision', { conversationId: 'main', type: 'decision.request', teamId: 'team-a', decision, timeoutMs: 60000 }), undefined)
  const session = integration.getSnapshot().offices[0].session.decisions
  assert.equal(session.resolve('team-a', decision.id, 'confirm'), null, 'remote requests must not bypass result submission')
  const first = session.choose('team-a', decision.id, 'reject'), duplicate = session.choose('team-a', decision.id, 'reject')
  assert.equal(first, duplicate)
  await first
  const results = replies.filter(reply => reply.responseToken === 'reply-decision')
  assert.equal(results.length, 1)
  assert.deepEqual(results[0].result.data, { conversationId: 'main', teamId: 'team-a', decisionId: 'approval', choiceId: 'reject', label: '拒绝' })
  assert.equal(session.getSnapshot().records[0].choiceId, 'reject')
})

test('expired decisions disappear in background teams without recording a default choice', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() })
  const { integration, send, replies } = await setup(t)
  await send('init', { type: 'offices.initialize', offices: [snapshot()] })
  await send('expire', { conversationId: 'main', type: 'decision.request', teamId: 'team-a', timeoutMs: 1000,
    decision: { id: 'short', kind: 'confirmation', title: '需要决定' } }, 1000)
  const decisions = integration.getSnapshot().offices[0].session.decisions
  assert.equal(decisions.getSnapshot().pending.length, 1)
  t.mock.timers.tick(1001)
  assert.equal(decisions.getSnapshot().pending.length, 0)
  assert.equal(decisions.getSnapshot().records.length, 0)
  assert.equal(replies.filter(reply => reply.responseToken === 'reply-expire').length, 0)
})

test('a failed result submission keeps the menu retryable and does not record a false success', async t => {
  let fail = false
  const { integration, send } = await setup(t, { reply: async () => { if (fail) throw new Error('network unavailable') } })
  await send('init', { type: 'offices.initialize', offices: [snapshot()] })
  await send('retry', { conversationId: 'main', type: 'decision.request', teamId: 'team-a', decision: { id: 'retry-menu', kind: 'confirmation', title: '提交？' } })
  const decisions = integration.getSnapshot().offices[0].session.decisions
  fail = true
  assert.equal(await decisions.choose('team-a', 'retry-menu', 'confirm'), null)
  assert.equal(decisions.getSnapshot().pending.length, 1)
  assert.equal(decisions.getSnapshot().records.length, 0)
  assert.match(decisions.getSnapshot().error, /network unavailable/)
  fail = false
  assert.equal((await decisions.choose('team-a', 'retry-menu', 'confirm')).choiceId, 'confirm')
})

test('a request already answered in another page closes without a misleading local success', async t => {
  let closed = false
  const { integration, send } = await setup(t, { reply: async () => { if (closed) throw Object.assign(new Error('closed'), { status: 410 }) } })
  await send('init', { type: 'offices.initialize', offices: [snapshot()] })
  await send('closed', { conversationId: 'main', type: 'decision.request', teamId: 'team-a', decision: { id: 'closed-menu', kind: 'confirmation', title: '提交？' } })
  closed = true
  const decisions = integration.getSnapshot().offices[0].session.decisions
  await decisions.choose('team-a', 'closed-menu', 'confirm')
  assert.equal(decisions.getSnapshot().pending.length, 0)
  assert.equal(decisions.getSnapshot().records.length, 0)
  assert.equal(decisions.getSnapshot().error, null)
})

test('browser cache restores offices and business snapshots without polling, while corrupt cache is preserved', async t => {
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const first = await setup(t, { storage })
  await first.send('init', { type: 'offices.initialize', offices: [snapshot()] })
  first.integration.stop()
  const second = await setup(t, { storage })
  assert.equal(second.integration.getSnapshot().offices[0].source.readSnapshot().conversations[0].tasks[0].title, '登录开发')
  assert.deepEqual(second.connections[0].teamIds, [])
  const key = [...values.keys()][0]; values.set(key, '{broken')
  const bad = await setup(t, { storage })
  assert.match(bad.integration.getSnapshot().error, /原缓存未覆盖/)
  await bad.send('new-init', { type: 'offices.initialize', offices: [snapshot()] })
  assert.equal(values.get(key), '{broken')
})

test('stopping invalidates queued business work and ignores callbacks from a closed transport', async t => {
  const { integration, connections, send } = await setup(t)
  const old = connections[0]
  integration.receive(delivery('late', { type: 'offices.initialize', offices: [snapshot()] }))
  integration.stop(); await flush(); await integration.start()
  old.onMessage(delivery('stale', { type: 'offices.initialize', offices: [snapshot('stale')] }))
  await flush()
  assert.equal(integration.getSnapshot().offices.length, 0)
  assert.equal((await send('current', { type: 'offices.initialize', offices: [snapshot()] })).result.code, 200)
})

test('versioned whiteboards update repeatedly, reject stale/conflicting snapshots and restore with their seq', async t => {
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const first = await setup(t, { storage })
  const one = snapshot(); one.conversations[0].whiteboard = { template: 'task-board-v1', title: '第一版', status: 'running', steps: [] }
  await first.send('board-init', { type: 'offices.initialize', offices: [one] })
  const two = structuredClone(one); two.seq = 2; two.conversations[0].whiteboard.title = '第二版'; two.conversations[0].tasks[0].status = 'completed'
  assert.equal((await first.send('board-new', { type: 'office.snapshot', teamId: 'team-a', snapshot: two })).result.code, 200)
  const stale = await first.send('board-old', { type: 'office.snapshot', teamId: 'team-a', snapshot: one })
  assert.equal(stale.result.data.reasonCode, 'STALE_SEQ')
  const conflict = structuredClone(two); conflict.conversations[0].whiteboard.title = '冲突'
  assert.equal((await first.send('board-conflict', { type: 'office.snapshot', teamId: 'team-a', snapshot: conflict })).result.code, 409)
  first.integration.stop()
  const second = await setup(t, { storage }), office = second.integration.getSnapshot().offices[0]
  assert.equal(office.source.readSnapshot().seq, 2)
  assert.equal(office.session.runtime.readWorld().props.find(prop => prop.id === 'whiteboard-1').state.taskBoard.title, '第二版')
  assert.equal(office.source.readSnapshot().conversations[0].tasks[0].status, 'completed')
  const board = office.session.runtime.readWorld().props.find(prop => prop.id === 'whiteboard-1')
  await office.session.refresh()
  assert.equal(office.session.runtime.readWorld().props.find(prop => prop.id === 'whiteboard-1').stateRevision, board.stateRevision, 'an unchanged whiteboard must not create a new internal revision')
})

for (const type of ['office.snapshot', 'offices.initialize']) test(`${type} retries repair a failed equal-seq sync without recreating the runtime or replaying actions`, async t => {
  const { integration, send } = await setup(t)
  await send('init', { type: 'offices.initialize', offices: [snapshot()] })
  const runtime = integration.getSnapshot().offices[0].session.runtime
  runtime.submit({ protocolVersion: '2.0', sceneId: 'team-a', commandId: 'keep-speech', type: 'activity.start', capability: 'scene.say',
    participants: [{ entityId: 'office-lead', role: 'actor' }], params: { text: '处理中', durationMs: 30000 } })
  const submit = runtime.submit.bind(runtime)
  let unavailable = true, visits = 0
  t.mock.method(runtime, 'submit', (...args) => {
    if (args[0].type === 'object.state.set' && unavailable) return { error: { message: 'Board unavailable' } }
    if (args[0].type === 'activity.start' && args[0].capability === 'office.visit') visits++
    return submit(...args)
  })
  const next = snapshot(); next.seq = 2
  next.conversations[0].whiteboard = { template: 'task-board-v1', title: '需要恢复的白板', status: 'running', steps: [] }
  next.conversations[0].employees[1].sceneActorId = 'code-agent'; next.conversations[0].tasks[0].assigneeId = 'testing'
  next.conversations[0].events = [{ id: 'assignment-once', kind: 'task.assigned', employeeId: 'testing', fromEmployeeId: 'coding', taskId: 'task-one', summary: '任务交接', occurredAt: '2026-10-18T10:00:00Z' }]
  const request = type === 'office.snapshot' ? { type, teamId: 'team-a', snapshot: next } : { type, offices: [next] }
  const failed = await send('failed', request)
  assert.equal(failed.result.code, 422); assert.equal(failed.result.data.reasonCode, 'SCENE_SYNC_FAILED')
  const failedRead = await send('failed-read', { type: 'office.read', teamId: 'team-a' })
  assert.equal(failedRead.result.data.runtime.available, false)
  assert.deepEqual(failedRead.result.data.runtime.objects, [])
  const board = () => runtime.readWorld().props.find(prop => prop.id === 'whiteboard-1')
  assert.notEqual(board().state.taskBoard?.title, next.conversations[0].whiteboard.title)
  const previousVisits = visits
  unavailable = false
  const retry = await send('retry', request)
  assert.equal(retry.result.code, 200)
  if (type === 'office.snapshot') assert.equal(retry.result.data.status, 'applied')
  assert.equal(board().state.taskBoard.title, next.conversations[0].whiteboard.title)
  assert.equal(integration.getSnapshot().offices[0].session.runtime, runtime)
  assert.equal(runtime.getRecord('keep-speech').status, 'running')
  assert.equal((await send('recovered-read', { type: 'office.read', teamId: 'team-a' })).result.data.runtime.available, true)
  assert.equal(visits, previousVisits, 'state retries must not replay task handoffs')
  const revision = board().stateRevision
  assert.equal((await send('again', request)).result.code, 200)
  assert.equal(board().stateRevision, revision, 'healthy equal-seq retries must not rewrite unchanged state')
  assert.equal(visits, previousVisits)
})

test('SSE state recovery preserves the existing runtime and does not replay historical handoffs', async t => {
  const { integration, send } = await setup(t)
  await send('init', { type: 'offices.initialize', offices: [snapshot()] })
  const runtime = integration.getSnapshot().offices[0].session.runtime
  const next = snapshot(); next.seq = 2; next.conversations[0].employees[1].sceneActorId = 'code-agent'; next.conversations[0].tasks[0].assigneeId = 'testing'
  next.conversations[0].events = [{ id: 'missed-assignment', kind: 'task.assigned', employeeId: 'testing', fromEmployeeId: 'coding', taskId: 'task-one', summary: '历史交接', occurredAt: '2026-10-18T10:00:00Z' }]
  integration.receive({ type: 'office.sync', snapshot: next }); await flush()
  assert.equal(integration.getSnapshot().offices[0].session.runtime, runtime)
  assert.equal(integration.getSnapshot().offices[0].source.readSnapshot().seq, 2)
  assert.equal(runtime.snapshot().activities.length, 0)
})

test('UI requests retain team identity, validate dialog options and never change business tasks locally', async t => {
  const { OfficeUiSession } = await server.ssrLoadModule('/example/office-web/src/application/OfficeUiSession.ts')
  const actions = [], ui = new OfficeUiSession('team-a', async action => { actions.push(action); return { target: 'dialog', content: { template: 'detail-v1', title: '详情', fields: [], actions: [{ id: 'approve', label: '审核' }] } } })
  await ui.request({ action: 'actor.inspect', actorId: 'office-lead' })
  assert.equal(actions[0].teamId, 'team-a')
  await ui.request({ action: 'dialog.action', interactionId: actions[0].id, optionId: 'approve' })
  await assert.rejects(ui.request({ action: 'dialog.action', interactionId: actions[0].id, optionId: 'missing' }), /失效/)
  const { OfficeTeamSession } = await server.ssrLoadModule('/example/office-web/src/application/OfficeTeamSession.ts')
  const { PushOfficeDataSource } = await server.ssrLoadModule('/example/office-web/src/dashboard/PushOfficeDataSource.ts')
  const source = new PushOfficeDataSource(snapshot()), runtime = createOfficeRuntime({ sceneId: 'team-a', referenceLayout: true })
  t.after(() => runtime.dispose())
  const session = new OfficeTeamSession(runtime, source, { requestUi: async action => { actions.push(action); return { target: 'dialog', content: { template: 'detail-v1', title: '已提交', fields: [], actions: [] } } } })
  await session.execute({ type: 'task.complete', taskId: 'task-one' })
  assert.equal(actions.at(-1).action, 'task.complete'); assert.equal(source.readSnapshot().conversations[0].tasks[0].status, 'running')
})

test('connection readiness follows state synchronization and decision enqueue failures have distinct reason codes', async t => {
  const { integration, connections, send } = await setup(t)
  connections[0].onStatus('已连接')
  assert.equal(integration.getSnapshot().connection, '正在同步最新状态')
  await send('init', { type: 'offices.initialize', offices: [snapshot()] })
  integration.receive({ type: 'office.sync.complete', offices: [{ teamId: 'team-a', seq: 1 }] }); await flush()
  assert.equal(integration.getSnapshot().connection, '已连接')
  connections[0].onStatus('重连中')
  integration.receive({ type: 'office.sync.complete', offices: [{ teamId: 'team-a', seq: 1 }] }); await flush()
  assert.equal(integration.getSnapshot().connection, '重连中')
  const decisions = integration.getSnapshot().offices[0].session.decisions
  const item = { id: 'duplicate', teamId: 'team-a', requester: { name: '王明', appearanceId: 'office-lead' }, kind: 'confirmation', title: '测试', description: '', confirmLabel: '确认', rejectLabel: '拒绝' }
  assert.equal(decisions.enqueue(item), true)
  assert.equal(decisions.enqueueError(item), 'DECISION_DUPLICATE')
  assert.equal(decisions.enqueueError({ ...item, id: 'expired', expiresAt: Date.now() - 1 }), 'DECISION_EXPIRED')
  for (let i = 0; i < 31; i++) decisions.enqueue({ ...item, id: `menu-${i}` })
  assert.equal(decisions.enqueueError({ ...item, id: 'full' }), 'DECISION_QUEUE_FULL')
})
