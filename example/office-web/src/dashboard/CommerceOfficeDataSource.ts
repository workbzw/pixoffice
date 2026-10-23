import type { ChatRequest } from '@pixoffice/protocol/chat'
import type { DashboardConversation, DashboardSnapshot } from '@pixoffice/protocol/dashboard'
import { ExampleOfficeDataSource } from './demoSource.ts'
import { commerceAssetConversation, commerceConversation, commerceMetricTable, commerceProduct, commerceTeams } from './commerceScenario.ts'
import type { CommerceStage, CommerceStrategy, CommerceTeam } from './commerceScenario.ts'

/** Local scenario state only; connected offices never instantiate this source. */
export class CommerceOfficeDataSource extends ExampleOfficeDataSource {
  readonly canExecute = false
  readonly replayEvents = false
  readonly commerceTeam: CommerceTeam
  stage: CommerceStage = 'ready'
  strategy: CommerceStrategy = 'information'
  private hasObservation = false
  private assignedTasks = new Set<string>()
  private activitySequence = 0
  constructor(team: CommerceTeam, now = new Date()) {
    const main = commerceConversation(team, 'ready', now), definition = commerceTeams[team]
    super(now, { workspace: { id: definition.id, name: definition.name }, employees: main.employees, tasks: main.tasks,
      whiteboard: main.whiteboard, conversationTitle: main.title, insightDomain: 'commerce', conversations: [commerceAssetConversation(team, 'product-assets', now), commerceAssetConversation(team, 'conversion-review', now)] })
    this.commerceTeam = team
    this.recordActivities(main, undefined, true, now.toISOString())
    this.replaceConversations([main])
  }
  beginDispatch() { this.assignedTasks.clear(); this.applyStage('dispatching') }
  waitingAssignments() { return this.getConversations().find(item => item.id === 'main')!.tasks.filter(task => task.status === 'queued' && task.assigneeId !== 'office-lead' && task.id !== 'update-review') }
  acceptAssignment(actorId: string) {
    for (const task of this.waitingAssignments().filter(task => task.assigneeId === actorId)) this.assignedTasks.add(task.id)
    this.applyStage(this.stage)
  }
  applyStage(stage: CommerceStage, strategy: CommerceStrategy = this.strategy) {
    const previous = this.getConversations().find(item => item.id === 'main')
    const stageChanged = stage !== this.stage
    if (['ready', 'dispatching', 'preparing'].includes(stage)) this.hasObservation = false
    if (['decision', 'optimizing', 'reviewing', 'updated', 'completed', 'paused'].includes(stage)) this.hasObservation = true
    this.stage = stage; this.strategy = strategy
    const main = commerceConversation(this.commerceTeam, stage, new Date(), strategy)
    main.tasks = main.tasks.map(task => task.status === 'queued' && this.assignedTasks.has(task.id) ? { ...task, status: 'running', progress: 0 } : task)
    const listingStep = main.whiteboard?.steps?.[0]
    if (listingStep && (stage === 'dispatching' || stage === 'preparing')) listingStep.progress = stage === 'preparing' ? 65 : Math.round(this.assignedTasks.size / 5 * 40)
    if (['paused', 'rejected', 'expired', 'stopped'].includes(stage)) {
      const ids = new Set(previous?.tasks.map(task => task.id))
      main.tasks = [...(previous?.tasks ?? []).map(task => ({ ...task, status: task.status === 'running' || task.status === 'queued' ? 'blocked' as const : task.status })), ...main.tasks.filter(task => !ids.has(task.id))]
      if (previous?.whiteboard) main.whiteboard!.steps = structuredClone(previous.whiteboard.steps)
    }
    this.recordActivities(main, previous, stageChanged)
    const visible = ['observing', 'decision', 'optimizing', 'reviewing', 'updated', 'completed', 'paused'].includes(stage)
    const reviewTaskIds = new Set(['first-observation', 'strategy-approval', 'product-improvement', 'update-review', 'second-observation', 'pause-followup'])
    const reviewTasks = visible ? main.tasks.filter(task => reviewTaskIds.has(task.id)) : []
    const review = { ...main, id: 'conversion-review', title: '经营复盘', tasks: reviewTasks,
      events: visible ? main.events.filter(event => !event.taskId || reviewTaskIds.has(event.taskId)) : [],
      whiteboard: { ...commerceAssetConversation(this.commerceTeam, 'conversion-review', new Date()).whiteboard!,
        status: visible ? main.whiteboard!.status : 'queued' as const,
        description: visible ? main.whiteboard!.description : '商品获批上架后，再查看访问、订单与购买咨询。',
        note: visible ? main.whiteboard!.note : '当前没有销售结果，不预先填写优化收益。' } }
    this.replaceConversations([main, review])
  }
  private recordActivities(main: DashboardConversation, previous?: DashboardConversation, stageChanged = true, at = new Date().toISOString()) {
    const events: DashboardSnapshot['events'] = []
    const add = (kind: DashboardSnapshot['events'][number]['kind'], summary: string, employeeId: string, taskId = '', fromEmployeeId = '') => {
      events.push({ id: `commerce-activity-${++this.activitySequence}`, kind, summary, employeeId, taskId, fromEmployeeId, occurredAt: at })
    }
    const tasks = new Map(previous?.tasks.map(task => [task.id, task]))
    for (const task of main.tasks) {
      const before = tasks.get(task.id), employeeId = task.assigneeId ?? ''
      const unchanged = before && before.status === task.status && before.assigneeId === task.assigneeId && before.title === task.title && before.summary === task.summary && before.progress === task.progress
      if (unchanged) { task.updatedAt = before.updatedAt; continue }
      if (before?.status === task.status && before.assigneeId === task.assigneeId) continue
      if (task.status === 'running') {
        if (before?.status === 'queued' && this.assignedTasks.has(task.id)) add('task.assigned', `收到负责人安排：${task.title}`, employeeId, task.id, 'office-lead')
        add('task.started', `开始执行：${task.title}`, employeeId, task.id)
      } else if (task.status === 'completed') add('task.completed', `已完成：${task.title}`, employeeId, task.id)
      else if (task.status === 'blocked') add('task.blocked', `${['paused', 'rejected', 'expired', 'stopped'].includes(this.stage) ? '本轮已中止，暂不继续' : '等待处理'}：${task.title}`, employeeId, task.id)
      else add('note', `${task.status === 'failed' ? '执行失败' : this.stage === 'ready' || this.stage === 'dispatching' ? '待命，等待负责人安排' : '等待执行'}：${task.title}`, employeeId, task.id)
    }
    if (stageChanged) for (const event of main.events) add(event.kind, event.summary, event.employeeId ?? '')
    main.events = [...events.reverse(), ...(previous?.events ?? [])].slice(0, 500)
  }
  reply(request: ChatRequest) {
    const question = request.messages.at(-1)?.content ?? ''
    const disclaimer = '\n\n这是固定电商案例的本地演示答复，不是实时店铺数据或 AI 自动执行结果。'
    if (/标题|文案|详情|图片|素材|参数/.test(question)) return `## 商品上架材料\n\n**标题**：${commerceProduct.title}\n\n**详情结构**：使用场景 → 材质与尺寸 → 调节与收纳 → 注意事项。\n\n**图片清单**：商品全貌、折叠收纳、笔记本使用场景、13–16 英寸适用尺寸图。${disclaimer}`
    if (/价格|售价|成本|优惠|降价/.test(question)) return `商品标价 **79 元**。${this.strategy === 'coupon' && ['optimizing', 'reviewing', 'updated', 'completed'].includes(this.stage) ? '已选择 5 元优惠方案，模拟成交价为 **74 元**。' : '当前未执行优惠降价。'}\n\n模拟成本 43 元；79 元售价下单笔差额为 36 元，未计广告、退货和固定成本。${disclaimer}`
    if (/销量|成交|数据|复盘|效果/.test(question)) return this.hasObservation
      ? `## 经营观察\n\n${commerceMetricTable(this.stage === 'completed' && this.strategy !== 'pause' ? this.strategy : undefined)}${disclaimer}`
      : `当前还没有完整的经营观察结果。${this.stage === 'rejected' ? '你已暂缓上架，不会生成销量。' : '商品获批上架并完成首轮观察后，再展示访问与订单数据。'}${disclaimer}`
    return `当前目标是完成 **${commerceProduct.name}** 的上架与经营优化。\n\n${commerceConversation(this.commerceTeam, this.stage, new Date(), this.strategy).whiteboard?.description}\n\n可以核对商品标题、图片、详情、价格和本轮经营数据。${disclaimer}`
  }
}
