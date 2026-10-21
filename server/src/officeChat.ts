import { Readable } from 'node:stream'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { chatPath, chatRequestSchema, chatTimeoutMs, readChatEvents } from '@pixoffice/protocol/chat'
import type { OfficeChatConfig } from '@pixoffice/protocol/chat'
import { stringifyProtocolObject } from '@pixoffice/protocol/schema'
import { OfficeStateFault } from './officeState.ts'

export function registerOfficeChat(app: FastifyInstance, options: {
  sameOrigin: (request: FastifyRequest) => boolean
  hasOffice: (teamId: string) => boolean
  timeoutMs?: number
}) {
  let url = ''
  const active = new Set<AbortController>()
  app.post(chatPath, { bodyLimit: 524288 }, async (request, reply) => {
    if (!options.sameOrigin(request)) throw new OfficeStateFault(403, 'FORBIDDEN', 'Use a same-origin browser connection')
    const parsed = chatRequestSchema.safeParse(request.body)
    if (!parsed.success) throw new OfficeStateFault(400, 'INVALID_MESSAGE', '聊天请求格式错误')
    if (!options.hasOffice(parsed.data.teamId)) throw new OfficeStateFault(404, 'OFFICE_NOT_INITIALIZED', '办公室未初始化')
    if (!url) throw new OfficeStateFault(503, 'CHAT_NOT_CONFIGURED', '外部后端尚未配置聊天服务')
    const controller = new AbortController()
    let timedOut = false
    const abort = () => controller.abort()
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, options.timeoutMs ?? chatTimeoutMs)
    timer.unref(); active.add(controller)
    reply.raw.on('close', abort)
    const cleanup = () => { clearTimeout(timer); active.delete(controller); reply.raw.off('close', abort) }
    let upstream: Response
    try {
      upstream = await fetch(url, { method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' }, body: stringifyProtocolObject(parsed.data) })
      if (!upstream.ok || !upstream.headers.get('content-type')?.includes('application/x-ndjson') || !upstream.body) {
        await upstream.body?.cancel()
        throw new Error('Invalid upstream response')
      }
    } catch {
      cleanup()
      if (reply.raw.destroyed) return reply
      throw new OfficeStateFault(timedOut ? 504 : 502, timedOut ? 'CHAT_TIMEOUT' : 'CHAT_UPSTREAM_ERROR',
        timedOut ? '聊天服务响应超时' : '聊天服务连接失败或返回格式错误')
    }
    const body = upstream.body!
    const events = async function* () {
      try {
        for await (const event of readChatEvents(body, controller.signal)) yield `${stringifyProtocolObject(event)}\n`
      } catch {
        if (!reply.raw.destroyed) yield `${stringifyProtocolObject({ type: 'error', message: timedOut ? '聊天服务响应超时' : '聊天服务返回了无效或中断的数据流' })}\n`
      } finally { cleanup() }
    }
    const stream = Readable.from(events())
    stream.once('close', () => { controller.abort(); cleanup() })
    return reply.type('application/x-ndjson; charset=utf-8').header('Cache-Control', 'no-store, no-transform')
      .header('X-Accel-Buffering', 'no').send(stream)
  })
  return {
    configure: (config: OfficeChatConfig) => { url = config.url },
    close: () => { for (const controller of active) controller.abort() },
  }
}
