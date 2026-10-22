import { chatCancelResultSchema, chatHistoryPageSchema, chatOperationSchema, readChatEvents } from '@pixoffice/protocol/chat'
import { responseEnvelopeSchema, stringifyProtocolObject } from '@pixoffice/protocol/schema'
import type { ChatCancelRequest, ChatEvent, ChatHistoryRequest, ChatOperation, ChatRequest, ChatResumeRequest, OfficeChatSource } from '@pixoffice/protocol/chat'

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const abort = () => { clearTimeout(timer); reject(signal.reason) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, ms)
    signal.addEventListener('abort', abort, { once: true })
  })
}

/** An explicit interaction preview, not an AI model or task executor. */
export class PreviewChatSource implements OfficeChatSource {
  readonly kind = 'preview'
  initialHistory(conversationId: string) {
    const histories: Record<string, string[]> = {
      main: ['请完成登录模块开发，拆解需求、实现功能并通过测试。', '已将任务分配给办公室成员。\n\n登录模块的需求方案已确认，接口与页面开发正在进行，联调测试等待上游交付。', '请继续完善方案，并整理需要我确认的事项。', '方案已更新，包含输入校验、错误提示和登录态保持。\n\n后续会继续进行接口联调与安全审查。'],
      requirements: ['我们先评审产品需求，明确这次的交付范围。', '正在梳理登录流程和验收标准。\n\n本次先完成邮箱密码登录、退出登录与登录态保持。'],
      integration: ['核对登录接口，完成联调验证。', '接口协议已核对，正在等待测试环境访问权限。授权后继续验证登录流程。'],
      weekly: ['本周项目周报先记录在这个会话里。', '好的，后续可以在这里汇总进展、风险与下一步计划。'],
    }
    return (histories[conversationId] ?? []).map((content, index) => ({ role: index % 2 ? 'assistant' as const : 'user' as const, content }))
  }
  async *stream(_request: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent> {
    yield { type: 'status', phase: 'thinking' }
    await delay(1000, signal)
    const response = '收到你的消息。\n\n这里目前是对话交互预览，尚未连接 AI 服务，因此不会分析或执行这条请求。接入聊天服务后，真实回复会在这里逐步显示。'
    for (let index = 0; index < response.length; index += 3) {
      await delay(35, signal)
      yield { type: 'delta', text: response.slice(index, index + 3) }
    }
    yield { type: 'done' }
  }
}

export class HttpChatSource implements OfficeChatSource {
  readonly kind = 'http'
  readonly historyKey: string
  private readonly url: string
  constructor(url: string) {
    const parsed = new URL(url, globalThis.location?.href ?? 'http://localhost')
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('聊天接口必须使用 HTTP 或 HTTPS')
    this.url = parsed.href
    this.historyKey = this.url
  }

  private async response(request: ChatOperation, signal: AbortSignal, streaming: boolean) {
    const response = await fetch(this.url, {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json', Accept: streaming ? 'application/x-ndjson' : 'application/json' },
      body: stringifyProtocolObject(chatOperationSchema.parse(request)),
    })
    if (!response.ok) {
      const result = responseEnvelopeSchema.safeParse(await response.json().catch(() => undefined))
      throw new Error(result.success ? `${result.data.msg}（${result.data.data.reasonCode ?? response.status}）` : `聊天服务请求失败（${response.status}）`)
    }
    return response
  }
  private async json(request: ChatOperation, signal: AbortSignal) {
    const response = await this.response(request, signal, false)
    const result = responseEnvelopeSchema.parse(await response.json())
    if (result.code !== response.status) throw new Error('聊天服务响应状态不一致')
    return result.data
  }
  async history(request: ChatHistoryRequest, signal: AbortSignal) {
    return chatHistoryPageSchema.parse(await this.json(request, signal))
  }
  async cancel(request: ChatCancelRequest, signal: AbortSignal) {
    chatCancelResultSchema.parse(await this.json(request, signal))
  }
  async *stream(request: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent> {
    yield* this.events(request, signal)
  }
  async *resume(request: ChatResumeRequest, signal: AbortSignal): AsyncIterable<ChatEvent> {
    yield* this.events(request, signal)
  }
  private async *events(request: ChatRequest | ChatResumeRequest, signal: AbortSignal): AsyncIterable<ChatEvent> {
    const response = await this.response(request, signal, true)
    if (!response.headers.get('content-type')?.includes('application/x-ndjson')) throw new Error('聊天服务未返回 NDJSON 数据流')
    if (!response.body) throw new Error('聊天服务没有返回内容')
    let first = true
    for await (const event of readChatEvents(response.body, signal)) {
      if (first && request.type === 'resume' && !['snapshot', 'error'].includes(event.type)) throw new Error('恢复回复需要先返回完整内容快照')
      first = false; yield event
    }
  }
}
