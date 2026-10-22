import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'

let server, ChatSession
before(async () => { server = await createTestServer(); ({ ChatSession } = await server.ssrLoadModule('/example/office-web/src/chat/ChatSession.ts')) })
after(() => server?.close())
const tick = () => new Promise(resolve => setImmediate(resolve))
const turn = (id, state = 'complete', assistant = `回复 ${id}`) => ({ id, user: `问题 ${id}`, assistant, state, error: '' })
const page = (turns, nextCursor = '', activeTurnId = '') => ({ turns, nextCursor, hasMore: Boolean(nextCursor), activeTurnId })

test('a new browser loads existing history and resumes the same unfinished answer without appending it twice', async t => {
  const requests = []
  const session = new ChatSession('team', { kind: 'test',
    history: async request => { requests.push(request); return page([turn('a'), turn('b', 'pending', '旧片段')], '', 'b') },
    async *resume(request) { requests.push(request); yield { type: 'snapshot', text: '最新片段', state: 'pending', message: '' }; yield { type: 'delta', text: '＋完成' }; yield { type: 'done' } },
    async *stream() { throw new Error('must not restart generation') },
  }, { conversationId: 'chat' }); t.after(() => session.dispose())
  await session.ready; await tick()
  assert.deepEqual(requests.map(request => [request.type, request.teamId, request.conversationId, request.turnId ?? '']), [['history', 'team', 'chat', ''], ['resume', 'team', 'chat', 'b']])
  assert.equal(session.getSnapshot().messages.length, 4)
  assert.equal(session.getSnapshot().messages.at(-1).content, '最新片段＋完成')
  assert.equal(session.getSnapshot().messages.at(-1).state, 'complete')
})

test('history pagination prepends unique turns and never overwrites a newer overlapping answer', async t => {
  const cursors = []
  const session = new ChatSession('team', { kind: 'test', async *stream() {}, history: async request => {
    cursors.push(request.cursor)
    return request.cursor ? page([turn('a'), turn('b', 'complete', '过时的 B')]) : page([turn('b'), turn('c')], 'older')
  } }); t.after(() => session.dispose())
  await session.ready; await session.loadOlder()
  assert.deepEqual(cursors, ['', 'older'])
  assert.deepEqual(session.getSnapshot().messages.map(message => message.id), ['a:user','a:assistant','b:user','b:assistant','c:user','c:assistant'])
  assert.equal(session.getSnapshot().messages[3].content, '回复 b')
  assert.equal(session.getSnapshot().hasMoreHistory, false)
})

test('refresh recovery preserves drafts and replaces the partial message with the authoritative reply', async t => {
  let saved
  const archive = { version: 1, teamId: 'team', conversationId: 'chat', draft: '还没发送的草稿', activeTurnId: 'a', messages: [
    { id: 'a:user', role: 'user', content: '问题 a', state: 'complete' }, { id: 'a:assistant', role: 'assistant', content: '旧的部分', state: 'pending' },
  ] }
  const session = new ChatSession('team', { kind: 'test', async *stream() {},
    history: async () => page([turn('a', 'pending')], '', 'a'),
    async *resume() { yield { type: 'snapshot', state: 'complete', text: '后台已经完成的完整回复', message: '' } },
  }, { persistence: { read: async () => archive, write: async value => { saved = value } } }); t.after(() => session.dispose())
  await session.ready; await tick(); await session.flush()
  assert.equal(session.getSnapshot().draft, '还没发送的草稿')
  assert.equal(saved.messages.length, 2); assert.equal(saved.messages[1].content, '后台已经完成的完整回复')
  assert.equal(saved.activeTurnId, '')
})

test('leaving a page detaches its receiver; only the explicit stop button cancels the backend generation', async t => {
  const controllers = [], cancels = []; let release
  const gate = new Promise(resolve => { release = resolve })
  const source = { kind: 'test', async *stream(request, signal) { controllers.push(signal); yield { type: 'delta', text: '部分回复' }; await gate; yield { type: 'done' } },
    cancel: async request => { cancels.push(request) },
  }
  const a = new ChatSession('team', source), b = new ChatSession('team', source); t.after(() => { a.dispose(); b.dispose() })
  const first = a.send('问题一'), second = b.send('问题二'); await tick()
  a.detach(); b.stop(); await tick()
  assert(controllers.every(signal => signal.aborted)); assert.equal(cancels.length, 1)
  assert.equal(cancels[0].type, 'cancel'); assert.equal(cancels[0].conversationId, b.id)
  release(); await first; await second
})

test('failed history reads retain local data and can be retried without losing the input draft', async t => {
  let available = false
  const session = new ChatSession('team', { kind: 'test', async *stream() {}, history: async () => {
    if (!available) throw new Error('连接中断')
    return page([turn('a')])
  } }); t.after(() => session.dispose())
  await session.ready; session.setDraft('保留草稿')
  assert.match(session.getSnapshot().historyError, /连接中断/)
  available = true; await session.synchronize(true)
  assert.equal(session.getSnapshot().historyError, null); assert.equal(session.getSnapshot().draft, '保留草稿')
  assert.equal(session.getSnapshot().messages.length, 2)
})

test('opening a transcript before local restoration finishes does not deadlock history synchronization', async t => {
  let release, reads = 0
  const gate = new Promise(resolve => { release = resolve })
  const session = new ChatSession('team', { kind: 'test', async *stream() {}, history: async () => { reads++; return page([turn('a')]) } }, {
    persistence: { read: async () => { await gate; return undefined }, write: async () => {} },
  }); t.after(() => session.dispose())
  const synchronization = session.synchronize()
  release()
  await Promise.race([Promise.all([session.ready, synchronization]), new Promise((_, reject) => { const timeout = setTimeout(() => reject(new Error('History restoration deadlocked')), 1000); timeout.unref() })])
  assert.equal(reads, 1); assert.equal(session.getSnapshot().messages.length, 2)
})

test('a lost stream blocks new turns until authoritative history is synchronized', async t => {
  let sends = 0
  const session = new ChatSession('team', { kind: 'test', history: async () => page([]), async *stream() { sends++; yield { type: 'delta', text: '部分' }; throw new Error('连接断开') } }); t.after(() => session.dispose())
  await session.ready; await session.send('问题')
  assert.match(session.getSnapshot().historyError, /连接断开/)
  await session.send('不应发送'); assert.equal(sends, 1)
  await session.synchronize(true)
  assert.equal(session.getSnapshot().historyError, null)
})

test('an unconfirmed stop requires history synchronization and cannot leak into a cleared conversation', async t => {
  let failCancel, release
  const gate = new Promise(resolve => { release = resolve })
  const source = { kind: 'test', history: async () => page([]), async *stream() { yield { type: 'delta', text: '部分' }; await gate; yield { type: 'done' } },
    cancel: () => new Promise((_, reject) => { failCancel = reject }),
  }
  const session = new ChatSession('team', source); t.after(() => { release(); session.dispose() })
  await session.ready
  const sending = session.send('问题'); await tick(); session.stop(); await tick(); failCancel(new Error('停止响应丢失')); await tick()
  assert.match(session.getSnapshot().historyError, /停止响应丢失/)
  await session.synchronize(true)
  const next = session.send('新问题'); await tick(); session.clear(); await tick(); failCancel(new Error('旧会话停止失败')); await tick()
  assert.equal(session.getSnapshot().historyError, null); assert.equal(session.getSnapshot().error, null); assert.equal(session.getSnapshot().canceling, false)
  release(); await sending; await next
})
