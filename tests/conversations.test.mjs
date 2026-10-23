import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'
import { officeSnapshotSchema } from '@pixoffice/protocol/office-integration'
import { officeMessageSchema } from '@pixoffice/protocol/office-integration'
import { readFile } from 'node:fs/promises'

let server, ChatWorkspace, OfficeTeamSession, PushOfficeDataSource, createOfficeRuntime, DecisionSession
before(async () => {
  server = await createTestServer()
  ;({ ChatWorkspace } = await server.ssrLoadModule('/example/office-web/src/chat/ChatWorkspace.ts'))
  ;({ OfficeTeamSession } = await server.ssrLoadModule('/example/office-web/src/application/OfficeTeamSession.ts'))
  ;({ PushOfficeDataSource } = await server.ssrLoadModule('/example/office-web/src/dashboard/PushOfficeDataSource.ts'))
  ;({ createOfficeRuntime } = await server.ssrLoadModule('/example/office-web/src/application/createOfficeRuntime.ts'))
  ;({ DecisionSession } = await server.ssrLoadModule('/example/office-web/src/application/decisions/DecisionSession.ts'))
})
after(() => server?.close())
const conversation = (id, status = 'running') => ({ id, title: `会话 ${id}`,
  employees: [{ id: 'dev', name: `开发 ${id}`, sceneActorId: 'office-lead' }],
  tasks: [{ id: 'same-task', title: `任务 ${id}`, assigneeId: 'dev', status, updatedAt: '2026-10-21T10:00:00Z' }], events: [],
  whiteboard: { title: `目标 ${id}`, status, steps: [{ id: 'same-step', title: '实现', progress: 0 }] } })
const snapshot = () => officeSnapshotSchema.parse({ schemaVersion: '1.0', seq: 1, workspace: { id: 'team', name: '研发' },
  conversations: [conversation('a'), conversation('b', 'queued')] })
const flush = () => new Promise(resolve => setImmediate(resolve))

test('conversation streams, drafts and complete transcripts survive switching and workspace restoration', async t => {
  const releases = new Map(), requests = [], signals = []
  let stored
  const persistence = { read: async () => structuredClone(stored), write: async value => { stored = structuredClone(value) } }
  const source = { kind: 'test', async *stream(request, signal) {
    requests.push(request); signals.push(signal)
    yield { type: 'delta', text: `回复 ${request.conversationId}` }
    await new Promise(resolve => releases.set(request.conversationId, resolve))
    yield { type: 'delta', text: ' 完成' }; yield { type: 'done' }
  } }
  const workspace = new ChatWorkspace('team', source, { persistence }); t.after(() => workspace.stop())
  await workspace.ready; workspace.sync(snapshot().conversations); await flush()
  const a = workspace.selected
  a.setDraft('A 的草稿')
  const first = a.send('A 的问题'); await flush()
  workspace.select('b'); const b = workspace.selected
  b.setDraft('B 的草稿')
  const second = b.send('B 的问题'); await flush()
  assert(signals.every(signal => !signal.aborted))
  assert.equal(a.getSnapshot().messages.at(-1).content, '回复 a')
  assert.equal(b.getSnapshot().messages.at(-1).content, '回复 b')
  assert.deepEqual(requests.map(request => [request.teamId, request.conversationId]), [['team','a'],['team','b']])
  releases.get('b')(); releases.get('a')(); await first; await second
  b.setDraft('保留 B 草稿'); await flush(); await b.flush(); await workspace.flush()
  const restored = new ChatWorkspace('team', source, { persistence }); t.after(() => restored.stop())
  await restored.ready; restored.sync(snapshot().conversations); await flush()
  assert.equal(restored.getSnapshot().selectedId, 'b')
  assert.equal(restored.selected.getSnapshot().draft, '保留 B 草稿')
  restored.select('a')
  assert.equal(restored.selected.getSnapshot().messages.at(-1).content, '回复 a 完成')
  const id = restored.create(); await flush()
  assert(!['a','b'].includes(id)); assert.equal(restored.selected.getSnapshot().messages.length, 0)
  assert.equal(restored.getSnapshot().conversations.length, 3)
})

test('deleting a conversation removes its history, stops its stream and survives stale sync and reload', async t => {
  let stored, release, signal
  const persistence = { read: async () => structuredClone(stored), write: async value => { stored = structuredClone(value) } }
  const source = { kind: 'test', async *stream(request, currentSignal) {
    signal = currentSignal; yield { type: 'delta', text: '已生成' }
    await new Promise(resolve => { release = resolve })
    yield { type: 'delta', text: '迟到内容' }; yield { type: 'done' }
  } }
  const workspace = new ChatWorkspace('team', source, { persistence }); t.after(() => workspace.stop())
  await workspace.ready; workspace.sync(snapshot().conversations); await flush()
  const removed = workspace.selected, answer = removed.send('需要删除的问题'); await flush()
  workspace.select('b'); workspace.selected.setDraft('B 的草稿'); await workspace.selected.flush()
  workspace.select('a'); await workspace.remove('a')
  assert.equal(signal.aborted, true)
  assert.equal(workspace.getSnapshot().selectedId, 'b')
  release(); await answer; await removed.flush(); await workspace.flush()
  workspace.sync(snapshot().conversations)
  assert.deepEqual(workspace.getSnapshot().conversations.map(entry => entry.id), ['b'])
  assert.deepEqual(stored.deletedIds, ['a'])
  assert(!stored.conversations.some(entry => entry.id === 'a'))
  const restored = new ChatWorkspace('team', source, { persistence }); t.after(() => restored.stop())
  await restored.ready; restored.sync(snapshot().conversations); await flush()
  assert.deepEqual(restored.getSnapshot().conversations.map(entry => entry.id), ['b'])
  assert.equal(restored.selected.getSnapshot().draft, 'B 的草稿')
})

test('backend-owned deletion waits for confirmation, coalesces repeated clicks and preserves failed deletions', async t => {
  let resolve, reject, calls = 0
  const workspace = new ChatWorkspace('team', { kind: 'test', async *stream() {} }, { requestDelete: () => {
    calls++; return new Promise((done, fail) => { resolve = done; reject = fail })
  } }); t.after(() => workspace.stop())
  await workspace.ready; workspace.sync(snapshot().conversations)
  const failed = workspace.remove('a'); assert.equal(workspace.remove('a'), failed); await flush()
  assert.deepEqual(workspace.getSnapshot().deletingIds, ['a'])
  assert.equal(workspace.getSnapshot().selectedId, 'a')
  reject(new Error('后端拒绝删除')); await assert.rejects(failed, /后端拒绝删除/)
  assert.equal(workspace.getSnapshot().conversations.length, 2)
  assert.deepEqual(workspace.getSnapshot().deletingIds, [])
  const success = workspace.remove('a'); await flush(); resolve(); await success
  assert.equal(calls, 2); assert.equal(workspace.getSnapshot().selectedId, 'b')
  workspace.restorePreviewConversation('a')
  assert.deepEqual(workspace.getSnapshot().conversations.map(entry => entry.id), ['b'], 'demo replay cannot restore a backend-owned deletion')
})

test('deleting the last local conversation leaves an empty workspace that can create a fresh conversation', async t => {
  const workspace = new ChatWorkspace('team', { kind: 'test', async *stream() {} }); t.after(() => workspace.stop())
  await workspace.ready
  const id = workspace.create(); await workspace.remove(id)
  assert.equal(workspace.getSnapshot().selectedId, '')
  assert.deepEqual(workspace.getSnapshot().conversations, [])
  const next = workspace.create(); assert(next); assert.notEqual(next, id)
  assert.equal(workspace.getSnapshot().selectedId, next)
})

test('deleting a local conversation waits for explicit backend cancellation and preserves it on failure', async t => {
  let finishReply, confirmCancel, failCancel
  const reply = new Promise(resolve => { finishReply = resolve })
  const workspace = new ChatWorkspace('team', { kind: 'test', async *stream() { yield { type: 'delta', text: '生成中' }; await reply; yield { type: 'done' } },
    cancel: () => new Promise((resolve, reject) => { confirmCancel = resolve; failCancel = reject }),
  }); t.after(() => { finishReply(); workspace.stop() })
  await workspace.ready
  const id = workspace.create(); await flush()
  const session = workspace.selected, sending = session.send('需要删除'); await flush()
  const deleting = workspace.remove(id); await flush()
  assert.equal(workspace.getSnapshot().conversations.length, 1)
  failCancel(new Error('离线')); await assert.rejects(deleting, /停止生成未确认/)
  assert.equal(workspace.getSnapshot().conversations.length, 1)
  const another = session.send('再次生成'); await flush()
  assert.equal(session.getSnapshot().messages.length, 2, 'an unconfirmed cancellation must not create another backend turn')
  const retried = workspace.remove(id); await flush(); confirmCancel(); await retried
  assert.equal(workspace.getSnapshot().conversations.length, 0)
  finishReply(); await sending; await another
})

test('deleting the last demo conversation clears the wall board and tasks, also after restoration', async t => {
  const { ExampleOfficeDataSource } = await server.ssrLoadModule('/example/office-web/src/dashboard/demoSource.ts')
  let stored
  const persistence = { read: async () => structuredClone(stored), write: async value => { stored = structuredClone(value) } }
  const make = () => {
    const runtime = createOfficeRuntime({ sceneId: 'team', referenceLayout: true })
    const session = new OfficeTeamSession(runtime, new ExampleOfficeDataSource(), { chatPersistence: persistence })
    t.after(() => { session.stop(); runtime.dispose() }); return session
  }
  const session = make(); await session.start()
  assert(session.getSnapshot().dashboard.tasks.length > 0)
  session.decisions.enqueue({ teamId: 'team', conversationId: 'main', id: 'menu', kind: 'confirmation', requester: { name: '开发', appearanceId: 'office-lead' }, title: '确认', description: '', confirmLabel: '是', rejectLabel: '否' })
  await session.chat.remove('main'); await session.refresh()
  assert.equal(session.getSnapshot().dashboard.tasks.length, 0)
  assert.equal(session.runtime.readWorld().props.find(prop => prop.id === 'whiteboard-1').state.taskBoard, undefined)
  assert.equal(session.decisions.getSnapshot().pending.length, 0)
  const restored = make(); await restored.start()
  assert.equal(restored.chat.getSnapshot().conversations.length, 0)
  assert.equal(restored.getSnapshot().dashboard.tasks.length, 0)
})

test('connected offices require an explicit backend deletion result', async t => {
  const runtime = createOfficeRuntime({ sceneId: 'team', referenceLayout: true }), actions = []
  const session = new OfficeTeamSession(runtime, new PushOfficeDataSource(snapshot()), { requestUi: async action => {
    actions.push(action); return { target: 'result', success: false, message: '正在处理受保护操作' }
  } }); t.after(() => { session.stop(); runtime.dispose() })
  await session.start()
  await assert.rejects(session.chat.remove('a'), /正在处理受保护操作/)
  assert.equal(session.chat.getSnapshot().conversations.length, 2)
  assert.deepEqual(actions.map(({ action, teamId, conversationId }) => ({ action, teamId, conversationId })), [{ action: 'conversation.delete', teamId: 'team', conversationId: 'a' }])
})

test('one office projects only the selected conversation while retaining background updates and the runtime', async t => {
  const data = snapshot(), source = new PushOfficeDataSource(data), runtime = createOfficeRuntime({ sceneId: 'team', referenceLayout: true })
  const session = new OfficeTeamSession(runtime, source); t.after(() => { session.stop(); runtime.dispose() })
  await session.start()
  const board = () => runtime.readWorld().props.find(prop => prop.id === 'whiteboard-1').state
  assert.equal(board().taskBoard.title, '目标 a')
  session.chat.select('b'); await session.refresh()
  assert.equal(board().taskBoard.title, '目标 b')
  assert.equal(session.getSnapshot().dashboard.tasks[0].title, '任务 b')
  data.seq = 2; data.conversations[0].tasks[0].status = 'completed'; data.conversations[0].whiteboard.status = 'completed'
  source.update(data); await session.refresh()
  assert.equal(board().taskBoard.title, '目标 b')
  assert.equal(session.getSnapshot().dashboard.tasks[0].status, 'queued')
  session.chat.select('a'); await session.refresh()
  assert.equal(session.getSnapshot().dashboard.tasks[0].status, 'completed')
  assert.equal(board().taskBoard.status, 'completed')
  assert.equal(session.runtime, runtime)
  session.chat.create(); await session.refresh()
  assert.deepEqual(session.getSnapshot().dashboard.tasks, [])
  assert.equal(board().taskBoard, undefined)
})

test('a restored conversation selection is applied before the first scene projection', async t => {
  const source = new PushOfficeDataSource(snapshot()), runtime = createOfficeRuntime({ sceneId: 'team', referenceLayout: true })
  const session = new OfficeTeamSession(runtime, source, { chatPersistence: { read: async () => ({ version: 2, teamId: 'team', selectedId: 'b', conversations: [
    { id: 'b', title: '会话 b', local: false, chat: { version: 1, teamId: 'team', conversationId: 'b', draft: '保留', messages: [] } },
  ] }), write: async () => {} } })
  t.after(() => { session.stop(); runtime.dispose() })
  await session.start()
  assert.equal(session.getSnapshot().dashboard.conversationId, 'b')
  assert.equal(session.getSnapshot().dashboard.whiteboard.title, '目标 b')
})

test('conversation IDs are unique, references stay inside a conversation and retired top-level tasks are rejected', () => {
  const value = snapshot()
  assert(officeSnapshotSchema.safeParse(value).success, 'task and employee IDs can repeat in different conversations')
  assert.equal(officeSnapshotSchema.safeParse({ ...value, conversations: [value.conversations[0], value.conversations[0]] }).success, false)
  value.conversations[1].tasks[0].assigneeId = 'missing'
  assert.equal(officeSnapshotSchema.safeParse(value).success, false)
  assert.equal(officeSnapshotSchema.safeParse({ ...snapshot(), tasks: [] }).success, false)
})

test('decision queues are independent between conversations but preserve ordering within each one', () => {
  const menu = (id, conversationId) => ({ teamId: 'team', conversationId, id, kind: 'confirmation', requester: { name: '开发', appearanceId: 'office-lead' }, title: id, description: '', confirmLabel: '确认', rejectLabel: '拒绝' })
  const decisions = new DecisionSession('team', [menu('a1','a'),menu('a2','a'),menu('b1','b')])
  assert.equal(decisions.resolve('team','a2','confirm'), null)
  assert.equal(decisions.resolve('team','b1','reject').request.conversationId, 'b')
  assert.deepEqual(decisions.getSnapshot().pending.map(item => item.id), ['a1','a2'])
  decisions.resolve('team','a1','confirm'); decisions.resolve('team','a2','confirm')
  decisions.clearReceipt(); decisions.stop()
})

test('late UI requests cannot leak dialogs, errors or busy state across conversations', async () => {
  const { OfficeUiSession } = await server.ssrLoadModule('/example/office-web/src/application/OfficeUiSession.ts')
  const waiting = new Map(), actions = []
  let selected = 'a'
  const ui = new OfficeUiSession('team', action => { actions.push(action); return new Promise((resolve, reject) => waiting.set(action.conversationId, { resolve, reject })) }, () => selected)
  const first = ui.request({ action: 'actor.inspect', actorId: 'office-lead' }).catch(() => {})
  selected = 'b'; ui.close()
  assert.equal(ui.getSnapshot().pending, false)
  const second = ui.request({ action: 'actor.inspect', actorId: 'office-lead' })
  waiting.get('a').reject(new Error('A 请求失败')); await first
  assert.equal(ui.getSnapshot().error, null); assert.equal(ui.getSnapshot().pending, true)
  waiting.get('b').resolve({ target: 'dialog', content: { template: 'detail-v1', title: 'B 的详情', description: '', fields: [], actions: [] } }); await second
  assert.equal(ui.getSnapshot().dialog.title, 'B 的详情')
  assert.deepEqual(actions.map(action => action.conversationId), ['a','b'])
})

test('published integration examples follow the conversation-aware request schema', async () => {
  for (const name of ['office-integration', 'dashboard-integration', 'chat-integration']) {
    const document = await readFile(new URL(`../integration/docs/${name}.md`, import.meta.url), 'utf8')
    for (const [, body] of document.matchAll(/```json\n([\s\S]*?)\n```/g)) {
      let value; try { value = JSON.parse(body) } catch { continue }
      if (value.type && ['offices.initialize','office.snapshot','office.read','office.capabilities','office.layout.read','office.layout.set','decision.request','ui.next','ui.respond'].includes(value.type)) {
        const parsed = officeMessageSchema.safeParse(value)
        assert(parsed.success, `${name}: ${JSON.stringify(parsed.error?.issues)}`)
      }
      if (value.schemaVersion && value.workspace) assert(officeSnapshotSchema.safeParse(value).success, name)
    }
  }
})
