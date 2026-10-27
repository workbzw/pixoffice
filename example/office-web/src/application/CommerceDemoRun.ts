import type { OfficeTeamSession } from './OfficeTeamSession.ts'
import type { DecisionRequest } from './decisions/DecisionSession.ts'
import { CommerceOfficeDataSource } from '../dashboard/CommerceOfficeDataSource.ts'
import { commerceMetricTable, commerceProduct } from '../dashboard/commerceScenario.ts'
import type { CommerceStage, CommerceStrategy } from '../dashboard/commerceScenario.ts'
import { OfficeScenarioQueue } from './OfficeScenarioQueue.ts'

type CommerceSession = OfficeTeamSession & { source: CommerceOfficeDataSource }
type LocalDecision<T = DecisionRequest> = T extends DecisionRequest ? Omit<T, 'teamId' | 'conversationId' | 'requester'> : never

export const commerceDemoTiming = { handoffSpeechMs: 800, preparationMs: 1500, firstObservationMs: 4000, optimizationMs: 2000, reviewMs: 1500, secondObservationMs: 5000, decisionTimeoutMs: 60000 } as const

/** A finite, local business story. Scene animations never approve business actions. */
export class CommerceDemoRun {
  private readonly sessions: CommerceSession[]
  private readonly timers = new Set<ReturnType<typeof setTimeout>>()
  private readonly subscriptions: (() => void)[] = []
  private readonly scenes = new Map<CommerceSession, OfficeScenarioQueue>()
  private awaiting?: { session: CommerceSession; id: string; resolve: (choice: string) => void }
  private ended = false
  private stage: CommerceStage = 'dispatching'
  private strategy: CommerceStrategy = 'information'
  readonly owner: OfficeTeamSession

  constructor(sessions: readonly OfficeTeamSession[], owner: OfficeTeamSession) {
    this.sessions = sessions.filter((session): session is CommerceSession => session.source instanceof CommerceOfficeDataSource)
    this.owner = owner
  }
  has(session: OfficeTeamSession) { return this.sessions.includes(session as CommerceSession) }
  start() {
    for (const session of this.sessions) {
      session.decisions.reset()
      const prepareChat = () => {
        if (this.ended) return
        session.chat.restorePreviewConversation('main')
        for (const entry of session.chat.getSnapshot().conversations) void entry.session.clearPreviewExchanges()
      }
      if (session.chat.getSnapshot().ready) prepareChat()
      else void session.chat.ready.then(prepareChat)
      this.subscriptions.push(session.decisions.subscribe(() => this.checkDecision()))
      let hasMain = session.chat.getSnapshot().conversations.some(entry => entry.id === 'main')
      this.subscriptions.push(session.chat.subscribe(() => {
        const present = session.chat.getSnapshot().conversations.some(entry => entry.id === 'main')
        const removed = hasMain && !present
        hasMain = present
        if (removed) this.finish('stopped')
      }))
      this.scenes.set(session, new OfficeScenarioQueue(session.runtime))
      session.source.beginDispatch()
    }
    this.log('dispatch-start', '开始本轮商品准备。', '本轮成员先待命。负责人将依次走访工位，交代各自的商品任务；每人回应结束后才开工，不会提前开始。')
    this.dispatchAssignments(() => {
      this.setStage('preparing')
      this.later(commerceDemoTiming.preparationMs, () => this.requestListing())
    })
  }
  private later(delay: number, callback: () => void) {
    const timer = setTimeout(() => { this.timers.delete(timer); if (!this.ended) callback() }, delay)
    this.timers.add(timer)
  }
  private setStage(stage: CommerceStage) {
    this.stage = stage
    for (const session of this.sessions) session.source.applyStage(stage, this.strategy)
  }
  private dispatchAssignments(onCompleted: () => void) {
    let remaining = this.sessions.length
    const done = () => { if (--remaining === 0 && !this.ended) onCompleted() }
    for (const session of this.sessions) {
      const actors = new Map(session.runtime.readActors().map(actor => [actor.id, actor]))
      const tasks = session.source.waitingAssignments()
      const pending = [...new Set(tasks.map(task => task.assigneeId!))]
      const stops: { hostId: string; message: string; reply: string }[] = []
      let position = actors.get('office-lead')!.position
      while (pending.length) {
        pending.sort((a, b) => {
          const first = actors.get(a)!.position, second = actors.get(b)!.position
          return Math.abs(first.x - position.x) + Math.abs(first.y - position.y) - Math.abs(second.x - position.x) - Math.abs(second.y - position.y)
        })
        const hostId = pending.shift()!, task = tasks.find(task => task.assigneeId === hostId)!
        stops.push({ hostId, message: this.stage === 'dispatching' && hostId === 'data-agent' ? '商品和后续更新都请你复核。' : `请${task.title}。`,
          reply: this.stage === 'dispatching' && hostId === 'data-agent' ? '收到，内容到齐后复核。' : `收到，开始${task.title}。` })
        position = actors.get(hostId)!.position
      }
      if (!stops.length) { done(); continue }
      this.scenes.get(session)!.visit(stops, commerceDemoTiming.handoffSpeechMs,
        actorId => { if (!this.ended) session.source.acceptAssignment(actorId) }, done)
    }
  }
  private log(id: string, question: string, answer: string) {
    for (const session of this.sessions) {
      const write = () => {
        if (this.ended || session.chat.source.kind !== 'preview') return
        for (const entry of session.chat.getSnapshot().conversations.filter(entry => entry.id === 'main' || entry.id === 'conversion-review')) void entry.session.previewExchange(id, question, answer)
      }
      if (session.chat.getSnapshot().ready) write()
      else void session.chat.ready.then(write)
    }
  }
  private request(session: CommerceSession, request: LocalDecision, resolve: (choice: string) => void) {
    const actor = session.runtime.readActors()[0]
    const createdAt = Date.now()
    const value = { ...request, id: `commerce-${request.id}-${crypto.randomUUID()}`, teamId: session.runtime.sceneId, conversationId: 'main',
      requester: { name: actor.name, appearanceId: actor.templateId }, createdAt, expiresAt: createdAt + commerceDemoTiming.decisionTimeoutMs, deadline: performance.now() + commerceDemoTiming.decisionTimeoutMs } as DecisionRequest
    if (!session.decisions.enqueue(value)) { this.finish('expired'); return }
    this.awaiting = { session, id: value.id, resolve }
  }
  private requestListing() {
    this.setStage('approval')
    this.log('listing-materials', '商品上架材料准备好了吗？', `## 上架材料已复核\n\n**商品标题**：${commerceProduct.title}\n\n**详情结构**：使用场景 → 材质与尺寸 → 六档调节 → 折叠收纳 → 注意事项。\n\n**图片清单**：商品主图、使用场景、折叠收纳和尺寸说明。审核发现适用范围缺失，现已补齐 **13–16 英寸**说明。\n\n**售价**：79 元；模拟成本 43 元，未计广告、退货和固定成本。\n\n当前尚未上架，等待你授权。`)
    const target = this.sessions.find(session => session === this.owner) ?? this.sessions[0]
    if (!target) return
    this.request(target, { id: 'listing', kind: 'confirmation', title: '是否按 79 元上架电脑支架？',
      description: '标题、详情、主图和适用尺寸已复核。仅模拟上架，不连接真实店铺、不扣费。', confirmLabel: '确认上架', rejectLabel: '暂不上架' }, choice => {
      if (choice !== 'confirm') { this.log('listing-rejected', '先不要上架。', '已暂缓上架，商品保持待发布。本轮不生成销售数据，也不自动继续优化。'); this.finish('rejected'); return }
      this.setStage('observing')
      this.log('listing-live', '确认按 79 元上架。', '已完成模拟上架，开始首轮经营观察。\n\n**模拟时间推进：上架后 24 小时。** 观察曝光、商品访问、订单与购买咨询，不执行真实投放。')
      this.later(commerceDemoTiming.firstObservationMs, () => this.requestStrategy())
    })
  }
  private requestStrategy() {
    this.setStage('decision')
    this.log('first-observation', '首轮上架后的表现怎么样？', `## 首轮经营观察\n\n${commerceMetricTable()}\n\n10 条模拟购买咨询中，有 6 条涉及适用尺寸或机型。**尺寸信息不足是待验证的假设，不是已证实的原因。**\n\n建议先补充尺寸图与适用说明，售价暂维持 79 元；也可选择小额优惠验证，或暂停推广排查。`)
    const target = this.sessions.find(session => session !== this.owner && session.source.commerceTeam === 'analysis')
      ?? this.sessions.find(session => session !== this.owner) ?? this.sessions[0]
    if (!target) return
    this.request(target, { id: 'strategy', kind: 'choice', title: '电脑支架下一步怎么优化？',
      description: '首轮 360 次访问、9 单；尺寸兼容咨询较多，选择一项措施。', options: [
        { id: 'information', label: '补充尺寸说明，保持 79 元', description: '新增适用尺寸图并重排详情，再观察成交变化。' },
        { id: 'coupon', label: '试用 5 元优惠', description: '模拟成交价 74 元，同时关注单笔差额下降。' },
        { id: 'pause', label: '暂停推广，继续排查', description: '不降价、不追加推广，先确认购买顾虑。' },
      ] }, choice => {
      this.strategy = choice as CommerceStrategy
      if (choice === 'pause') { this.log('strategy-chosen', '先暂停推广。', '已暂停新增推广，保留原商品。继续排查尺寸兼容与购买顾虑，未降价，也不会生成优化后的销售结果。'); this.finish('paused'); return }
      this.setStage('optimizing')
      this.log('strategy-chosen', choice === 'coupon' ? '试用 5 元优惠。' : '补充尺寸说明，先不降价。', choice === 'coupon'
        ? '已安排定价与审核人员核对 5 元优惠。标价仍为 79 元，模拟成交价 74 元；单笔售价与模拟成本的差额由 36 元降为 31 元，尚未计入广告与退货。'
        : '已安排补充 13–16 英寸适用尺寸图，明确不适用范围，并把尺寸信息移到详情前部。售价保持 79 元。')
      this.dispatchAssignments(() => this.later(commerceDemoTiming.optimizationMs, () => {
        this.setStage('reviewing')
        this.later(commerceDemoTiming.reviewMs, () => {
          this.setStage('updated')
          this.log('product-updated', '这轮修改完成了吗？', `${this.strategy === 'coupon' ? '5 元优惠配置已完成复核，模拟成交价为 74 元。' : '尺寸图与适用说明已补齐，详情顺序已更新，售价仍为 79 元。'}\n\n已更新原商品，开始第二个模拟 24 小时观察窗口。`)
          this.later(commerceDemoTiming.secondObservationMs, () => this.complete())
        })
      }))
    })
  }
  private checkDecision() {
    const awaiting = this.awaiting
    if (!awaiting || this.ended) return
    const state = awaiting.session.decisions.getSnapshot()
    const record = state.records.find(item => item.request.id === awaiting.id)
    if (record) { this.awaiting = undefined; awaiting.resolve(record.choiceId) }
    else if (!state.pending.some(item => item.id === awaiting.id)) { this.awaiting = undefined; this.finish('expired') }
  }
  private complete() {
    this.setStage('completed')
    this.log('final-review', '对比两轮结果，下一步怎么办？', `## 商品优化复盘\n\n${commerceMetricTable(this.strategy === 'coupon' ? 'coupon' : 'information')}\n\n${this.strategy === 'coupon'
      ? '优惠后订单从 9 单变为 13 单，成交单价下降到 74 元。模拟售价与成本差额合计为 403 元，首轮为 324 元；尚未扣广告、退货和固定成本。'
      : '访问从 360 次变为 350 次，订单从 9 单变为 14 单。不是所有指标都增长；本次样例展示“信息更清楚”这一待验证方向。'}\n\n**下一步**：延长观察窗口，检查退款与售后，再决定是否扩大推广。没有真实发布、投放或扣费。`)
    this.finish('completed')
  }
  tick() {
    if (this.ended) return
    try { for (const queue of this.scenes.values()) { queue.tick(); if (this.ended) break } }
    catch (error) {
      this.log('handoff-failed', '派工是否完成？', `派工已停止：${error instanceof Error ? error.message : '交接失败'}。未收到任务的成员不会开工，也不会跳过交接进入上架或商品更新。`)
      this.finish('stopped')
    }
  }
  private finish(stage: CommerceStage) {
    if (this.ended) return
    this.ended = true
    if (stage !== this.stage) this.setStage(stage)
    this.cleanup()
    this.owner.simulation.setDemo(false)
  }
  private cleanup() {
    for (const timer of this.timers) clearTimeout(timer)
    this.timers.clear()
    for (const unsubscribe of this.subscriptions) unsubscribe()
    this.subscriptions.length = 0
    if (this.awaiting) this.awaiting.session.decisions.dismiss(this.awaiting.id)
    this.awaiting = undefined
    for (const queue of this.scenes.values()) queue.stop()
  }
  stop() { if (!this.ended) this.finish('stopped') }
}
