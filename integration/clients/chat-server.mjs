import Fastify from 'fastify'
import { fileURLToPath } from 'node:url'
import { chatOperationSchema } from '@pixoffice/protocol/chat'

/** An in-memory reference service. Production engines own durable history and generation. */
export function createExampleChatServer({ seedTurns = 0, chunkDelayMs = 80, replyText = '这是长会话接入演示。\n\n历史记录按页读取，刷新页面后会继续接收同一条回复。' } = {}) {
  const app = Fastify(), conversations = new Map(), streams = new Set()
  const result = data => ({ code: 200, msg: 'OK', data })
  const emit = (turn, event) => { for (const send of turn.listeners) send(event) }
  const view = turn => ({ id: turn.id, user: turn.user, assistant: turn.assistant, state: turn.state, error: turn.error })
  const snapshot = turn => ({ type: 'snapshot', text: turn.assistant, state: turn.state, message: turn.error })
  const stop = turn => {
    if (turn.state !== 'pending') return
    clearInterval(turn.timer); turn.state = 'stopped'; emit(turn, snapshot(turn))
  }
  app.post('/chat', async (request, response) => {
    const parsed = chatOperationSchema.safeParse(request.body)
    if (!parsed.success) return response.code(400).send({ code: 400, msg: 'Invalid chat operation', data: { reasonCode: 'INVALID_MESSAGE' } })
    const input = parsed.data, key = JSON.stringify([input.teamId, input.conversationId])
    if (!conversations.has(key)) conversations.set(key, Array.from({ length: seedTurns }, (_, index) => ({
      id: `seed-${index}`, user: `历史问题 ${index + 1}`, assistant: `历史回复 ${index + 1}\n\n- 明确需求\n- 完成实现\n- 验证结果`, state: 'complete', error: '', listeners: new Set(),
    })))
    const turns = conversations.get(key)
    if (input.type === 'history') {
      const end = input.cursor ? turns.findIndex(turn => turn.id === input.cursor) : turns.length
      if (end < 0) return response.code(400).send({ code: 400, msg: 'History cursor not found', data: { reasonCode: 'INVALID_CURSOR' } })
      const start = Math.max(0, end - input.limit), selected = turns.slice(start, end)
      return result({ turns: selected.map(view), hasMore: start > 0, nextCursor: start > 0 ? turns[start].id : '', activeTurnId: selected.find(turn => turn.state === 'pending')?.id ?? '' })
    }
    let turn = turns.find(turn => turn.id === input.turnId)
    if (input.type === 'cancel') { if (turn) stop(turn); return result({ stopped: true }) }
    if (!turn && input.type === 'send') {
      const user = input.messages.at(-1)
      if (user?.role !== 'user' || !user.content.trim()) return response.code(400).send({ code: 400, msg: 'A user message is required', data: { reasonCode: 'INVALID_MESSAGE' } })
      if (turns.some(turn => turn.state === 'pending')) return response.code(409).send({ code: 409, msg: 'A reply is already running', data: { reasonCode: 'CHAT_BUSY' } })
      turn = { id: input.turnId, user: user.content, assistant: '', state: 'pending', error: '', listeners: new Set() }
      turns.push(turn)
      turn.timer = setInterval(() => {
        const text = replyText.slice(turn.assistant.length, turn.assistant.length + 3)
        turn.assistant += text
        if (text) emit(turn, { type: 'delta', text })
        if (turn.assistant.length >= replyText.length) { clearInterval(turn.timer); turn.state = 'complete'; emit(turn, { type: 'done' }) }
      }, chunkDelayMs)
    }
    if (!turn) return response.code(404).send({ code: 404, msg: 'Chat turn not found', data: { reasonCode: 'TURN_NOT_FOUND' } })
    if (input.type === 'send' && input.messages.at(-1)?.content !== turn.user) return response.code(409).send({ code: 409, msg: 'Turn ID already has different content', data: { reasonCode: 'TURN_CONFLICT' } })
    response.hijack()
    const stream = response.raw; streams.add(stream)
    stream.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' })
    const send = event => {
      if (stream.destroyed || stream.writableEnded) return
      if (stream.writableLength > 524288) { stream.destroy(); return }
      stream.write(`${JSON.stringify(event)}\n`)
      if (event.type === 'done' || event.type === 'error' || event.type === 'snapshot' && event.state !== 'pending') stream.end()
    }
    turn.listeners.add(send)
    stream.once('close', () => { streams.delete(stream); turn.listeners.delete(send) })
    send(snapshot(turn))
    return response
  })
  app.addHook('preClose', async () => {
    for (const turns of conversations.values()) for (const turn of turns) clearInterval(turn.timer)
    for (const stream of streams) stream.destroy()
  })
  return app
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = createExampleChatServer()
  console.log(`Chat example: ${await app.listen({ host: '127.0.0.1', port: Number(process.env.PIXOFFICE_CHAT_PORT ?? 8788) })}/chat`)
  process.once('SIGINT', async () => { await app.close(); process.exit(0) })
}
