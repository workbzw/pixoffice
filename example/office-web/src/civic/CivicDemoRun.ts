import type { OfficeTeamSession } from '../application/OfficeTeamSession.ts'
import type { DecisionRequest } from '../application/decisions/DecisionSession.ts'
import { OfficeScenarioQueue } from '../application/OfficeScenarioQueue.ts'
import { CivicOfficeDataSource } from './CivicOfficeDataSource.ts'
import { civicCase, civicResultTable, civicResults } from './scenario.ts'
import type { CivicStage, CivicStrategy } from './scenario.ts'

type CivicSession = OfficeTeamSession & { source: CivicOfficeDataSource }
type LocalDecision<T = DecisionRequest> = T extends DecisionRequest ? Omit<T, 'teamId' | 'conversationId' | 'requester'> : never
export const civicDemoTiming = { handoffSpeechMs: 800, preparationMs: 2500, serviceMs: 4500, adjustmentMs: 2500, checkMs: 2500, archiveMs: 2000, decisionTimeoutMs: 60000 } as const

/** A local public-service story; decisions never perform real administrative actions. */
export class CivicDemoRun {
  readonly owner: OfficeTeamSession
  private readonly sessions: CivicSession[]
  private readonly scenes = new Map<CivicSession, OfficeScenarioQueue>()
  private readonly timers = new Set<ReturnType<typeof setTimeout>>()
  private readonly subscriptions: (() => void)[] = []
  private awaiting?: { session: CivicSession; id: string; resolve: (choice: string) => void }
  private strategy: CivicStrategy = 'guidance'
  private ended = false

  constructor(sessions: readonly OfficeTeamSession[], owner: OfficeTeamSession) {
    this.owner = owner
    this.sessions = sessions.filter((session): session is CivicSession => session.source instanceof CivicOfficeDataSource)
  }
  has(session: OfficeTeamSession) { return this.sessions.includes(session as CivicSession) }
  start() {
    for (const session of this.sessions) {
      session.decisions.reset()
      const prepareChat = () => {
        if (this.ended) return
        session.chat.restorePreviewConversation('main')
        for (const entry of session.chat.getSnapshot().conversations) void entry.session.clearPreviewExchanges('civic-demo')
      }
      if (session.chat.getSnapshot().ready) prepareChat()
      else void session.chat.ready.then(prepareChat)
      this.subscriptions.push(session.decisions.subscribe(() => this.checkDecision()))
      let hasMain = session.chat.getSnapshot().conversations.some(entry => entry.id === 'main')
      this.subscriptions.push(session.chat.subscribe(() => {
        const present = session.chat.getSnapshot().conversations.some(entry => entry.id === 'main')
        if (hasMain && !present) this.finish('stopped')
        hasMain = present
      }))
      this.scenes.set(session, new OfficeScenarioQueue(session.runtime))
      session.source.beginDispatch()
    }
    this.log('dispatch', '开始准备社区便民服务日。', `## 保障任务已拆解\n\n${civicCase.time}，${civicCase.location}。三个小组围绕同一事项协作，负责人逐人走访交代任务，成员回应后开工。\n\n方案确认前不发布通知，不生成现场服务结果；全部内容均为本地模拟。`)
    this.dispatch(() => { this.setStage('preparing'); this.later(civicDemoTiming.preparationMs, () => this.requestApproval()) })
  }
  private later(delay: number, callback: () => void) {
    const timer = setTimeout(() => { this.timers.delete(timer); if (!this.ended) callback() }, delay)
    this.timers.add(timer)
  }
  private setStage(stage: CivicStage) { for (const session of this.sessions) session.source.applyStage(stage, this.strategy) }
  private dispatch(done: () => void) {
    let remaining = this.sessions.length
    const complete = () => { if (--remaining === 0 && !this.ended) done() }
    for (const session of this.sessions) {
      const actors = new Map(session.runtime.readActors().map(actor => [actor.id, actor]))
      const tasks = session.source.waitingAssignments(), pending = [...new Set(tasks.map(task => task.assigneeId!))]
      const stops: { hostId: string; message: string; reply: string }[] = []
      let position = actors.get('office-lead')!.position
      while (pending.length) {
        pending.sort((a, b) => {
          const first = actors.get(a)!.position, second = actors.get(b)!.position
          return Math.abs(first.x - position.x) + Math.abs(first.y - position.y) - Math.abs(second.x - position.x) - Math.abs(second.y - position.y)
        })
        const hostId = pending.shift()!, task = tasks.find(task => task.assigneeId === hostId)!
        const followup = session.source.stage === 'dispatching' ? hostId === 'data-agent' ? '后续回访结果也请复核。' : hostId === 'file-agent' ? '最后请汇总记录归档。' : '' : ''
        stops.push({ hostId, message: `请${task.title}。${followup}`, reply: `收到，开始${task.title}。` })
        position = actors.get(hostId)!.position
      }
      if (!stops.length) { complete(); continue }
      this.scenes.get(session)!.visit(stops, civicDemoTiming.handoffSpeechMs, actorId => { if (!this.ended) session.source.acceptAssignment(actorId) }, complete)
    }
  }
  private log(id: string, question: string, answer: string) {
    for (const session of this.sessions) {
      const write = () => {
        if (this.ended || session.chat.source.kind !== 'preview') return
        for (const entry of session.chat.getSnapshot().conversations.filter(entry => entry.id === 'main' || entry.id === 'service-review')) void entry.session.previewExchange(id, question, answer, 'civic-demo')
      }
      if (session.chat.getSnapshot().ready) write()
      else void session.chat.ready.then(write)
    }
  }
  private request(session: CivicSession, request: LocalDecision, resolve: (choice: string) => void) {
    const actor = session.runtime.readActors()[0], createdAt = Date.now()
    const value = { ...request, id: `civic-${request.id}-${crypto.randomUUID()}`, teamId: session.runtime.sceneId, conversationId: 'main',
      requester: { name: actor.name, appearanceId: actor.templateId }, createdAt, expiresAt: createdAt + civicDemoTiming.decisionTimeoutMs, deadline: performance.now() + civicDemoTiming.decisionTimeoutMs } as DecisionRequest
    if (!session.decisions.enqueue(value)) { this.finish('expired'); return }
    this.awaiting = { session, id: value.id, resolve }
  }
  private requestApproval() {
    this.setStage('approval')
    this.log('approval', '保障方案准备好了吗？', `## 保障方案已复核\n\n- 诉求：12 项，已完成服务类型与材料要求分类。\n- 材料：服务范围、材料清单、通知和回访模板已核对。\n- 现场：咨询台、等候动线、无障碍通道与值守岗位已检查。\n- 隐私：仅展示模拟编号，不包含居民个人信息。\n\n当前尚未启动服务，等待你确认。`)
    const target = this.sessions.find(session => session === this.owner) ?? this.sessions[0]
    if (!target) return
    this.request(target, { id: 'approval', kind: 'confirmation', title: '是否确认启动便民服务保障？',
      description: '服务材料、通知和现场岗位已复核。确认后模拟启动服务，不发布真实通知、不办理真实事项。', confirmLabel: '确认启动', rejectLabel: '暂缓完善' }, choice => {
      if (choice !== 'confirm') { this.log('rejected', '先完善方案，暂不启动。', '已暂缓启动，保留材料和岗位安排。未发布通知，也不会生成现场办结数据。'); this.finish('rejected'); return }
      this.setStage('serving')
      this.log('started', '确认启动服务保障。', '三个小组开始模拟现场协同。\n\n**模拟时间推进：服务开始后 30 分钟。** 分别跟踪已完成事项、待补材料和平均等候，不将受理数量当成办结数量。')
      this.later(civicDemoTiming.serviceMs, () => this.requestAdjustment())
    })
  }
  private requestAdjustment() {
    this.setStage('decision')
    this.log('service', '现场服务进展如何？', `## 首轮服务台账\n\n${civicResultTable()}\n\n4 项诉求需要补充材料，重复咨询拉长了等候。可增加入口预检和材料清单引导，也可分时回访，避免居民重复等候。`)
    const target = this.sessions.find(session => session !== this.owner && session.source.civicTeam === 'review') ?? this.sessions.find(session => session !== this.owner) ?? this.sessions[0]
    if (!target) return
    this.request(target, { id: 'adjustment', kind: 'choice', title: '现场等候较长，如何补充保障？', description: '8 项已完成，4 项待补材料。选择一项措施，再交给成员执行。', options: [
      { id: 'guidance', label: '增加材料预检与现场引导', description: '补充简明清单，入口先核对材料，再分流咨询。' },
      { id: 'appointments', label: '安排分时回访与材料补交', description: '逐项告知缺少的材料，约定补交时段。' },
      { id: 'hold', label: '暂缓调整，补充核实', description: '保留现有服务安排，不自动执行新措施。' },
    ] }, choice => {
      this.strategy = choice as CivicStrategy
      if (choice === 'hold') { this.log('hold', '先核实，再调整。', '已暂缓补充保障措施，保留首轮服务台账。4 项待补材料事项继续跟进，未生成后续办结结果。'); this.finish('paused'); return }
      this.setStage('adjusting')
      this.log('adjustment', choice === 'appointments' ? '安排分时回访。' : '增加材料预检与现场引导。', choice === 'appointments'
        ? '负责人将逐人安排回访和材料补交任务，明确缺少的材料与回访时段。未补齐的事项保留待办。'
        : '负责人将逐人安排补充材料清单和入口预检，引导不同需求分流办理。收到安排后再执行。')
      this.dispatch(() => this.later(civicDemoTiming.adjustmentMs, () => {
        this.setStage('checking')
        this.log('checking', '补充保障执行得怎么样？', '补充保障已执行，复核人员开始核对回访与材料记录。确认实际完成的事项，并把仍需补材料的事项移交跟进。')
        this.later(civicDemoTiming.checkMs, () => {
          this.setStage('archiving')
          this.log('archiving', '复核通过，可以归档了吗？', '回访结果与待补材料事项已核对，正在整理通知、岗位表、服务台账与待办移交记录。归档完成后再结束本轮流程。')
          this.later(civicDemoTiming.archiveMs, () => this.complete())
        })
      }))
    })
  }
  private checkDecision() {
    const awaiting = this.awaiting
    if (!awaiting || this.ended) return
    if (awaiting.session.chat.getSnapshot().deletingIds.includes('main')) { this.awaiting = undefined; this.finish('stopped'); return }
    const state = awaiting.session.decisions.getSnapshot(), record = state.records.find(item => item.request.id === awaiting.id)
    if (record) { this.awaiting = undefined; awaiting.resolve(record.choiceId) }
    else if (!state.pending.some(item => item.id === awaiting.id)) { this.awaiting = undefined; this.finish('expired') }
  }
  private complete() {
    this.setStage('completed')
    const result = civicResults(this.strategy)
    this.log('completed', '汇总本轮服务情况并归档。', `## 便民服务保障复盘\n\n${civicResultTable(this.strategy)}\n\n通知、岗位安排、现场台账和回访记录已归档。**${result.pending} 项待补材料事项仍保留待办**，已移交责任人继续跟进，不计入已办结。\n\n本轮服务保障流程完成；这不代表所有居民事项都已办结。`)
    this.finish('completed')
  }
  tick() {
    if (this.ended) return
    try { for (const queue of this.scenes.values()) { queue.tick(); if (this.ended) break } }
    catch (error) { this.log('failed', '派工完成了吗？', `派工已停止：${error instanceof Error ? error.message : '交接失败'}。未收到安排的成员不会开工，也不会跳过确认执行服务。`); this.finish('stopped') }
  }
  private finish(stage: CivicStage) {
    if (this.ended) return
    this.ended = true
    this.setStage(stage)
    for (const timer of this.timers) clearTimeout(timer)
    this.timers.clear()
    for (const unsubscribe of this.subscriptions) unsubscribe()
    this.subscriptions.length = 0
    if (this.awaiting) this.awaiting.session.decisions.dismiss(this.awaiting.id)
    this.awaiting = undefined
    for (const queue of this.scenes.values()) queue.stop()
    this.owner.simulation.setDemo(false)
  }
  stop() { this.finish('stopped') }
}
