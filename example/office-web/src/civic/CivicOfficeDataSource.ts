import type { ChatRequest } from '@pixoffice/protocol/chat'
import type { DashboardConversation, DashboardSnapshot } from '@pixoffice/protocol/dashboard'
import { ExampleOfficeDataSource } from '../dashboard/demoSource.ts'
import { civicCase, civicConversation, civicResultTable, civicSupportingConversation, civicTeams } from './scenario.ts'
import type { CivicStage, CivicStrategy, CivicTeam } from './scenario.ts'

export class CivicOfficeDataSource extends ExampleOfficeDataSource {
  readonly canExecute = false
  readonly replayEvents = false
  readonly civicTeam: CivicTeam
  stage: CivicStage = 'ready'
  strategy: CivicStrategy = 'guidance'
  private readonly assignedTasks = new Set<string>()
  private activitySequence = 0

  constructor(team: CivicTeam, now = new Date(), workspace = { id: civicTeams[team].id, name: civicTeams[team].name }) {
    const main = civicConversation(team, 'ready', now)
    super(now, { workspace, employees: main.employees, tasks: main.tasks, whiteboard: main.whiteboard, conversationTitle: main.title, insightDomain: 'civic',
      conversations: [civicSupportingConversation(team, 'service-materials', now), civicSupportingConversation(team, 'service-review', now)] })
    this.civicTeam = team
    this.recordActivities(main, undefined, true, now.toISOString())
    this.replaceConversations([main])
  }
  beginDispatch() { this.assignedTasks.clear(); this.applyStage('dispatching') }
  waitingAssignments() { return this.getConversations().find(item => item.id === 'main')!.tasks.filter(task => task.status === 'queued' && task.assigneeId !== 'office-lead' && task.id !== 'service-check' && task.id !== 'service-archive') }
  acceptAssignment(actorId: string) {
    for (const task of this.waitingAssignments().filter(task => task.assigneeId === actorId)) this.assignedTasks.add(task.id)
    this.applyStage(this.stage)
  }
  applyStage(stage: CivicStage, strategy: CivicStrategy = this.strategy) {
    const previous = this.getConversations().find(item => item.id === 'main'), changed = stage !== this.stage
    this.stage = stage; this.strategy = strategy
    const main = civicConversation(this.civicTeam, stage, new Date(), strategy)
    main.tasks = main.tasks.map(task => task.status === 'queued' && this.assignedTasks.has(task.id) ? { ...task, status: 'running', progress: 0 } : task)
    if (stage === 'dispatching' || stage === 'preparing') main.whiteboard!.steps![0].progress = stage === 'preparing' ? 65 : this.assignedTasks.size * 8
    if (['paused', 'rejected', 'expired', 'stopped'].includes(stage) && previous) {
      main.tasks = previous.tasks.map(task => task.status === 'queued' || task.status === 'running' ? { ...task, status: 'blocked' } : task)
      main.tasks = main.tasks.map(task => task.id === 'service-approval' || task.id === 'service-decision' ? { ...task,
        title: stage === 'expired' ? '确认已到期，待重新发起' : stage === 'rejected' ? '方案暂缓，待补充完善' : stage === 'paused' ? '保障调整暂缓，待补充核实' : '本轮已停止，未继续确认',
        summary: main.whiteboard!.description } : task)
      main.whiteboard!.steps = structuredClone(previous.whiteboard!.steps)
    }
    this.recordActivities(main, previous, changed)
    const visible = ['serving', 'decision', 'adjusting', 'checking', 'archiving', 'completed'].includes(stage)
      || Boolean(previous?.tasks.some(task => task.id === 'service-live'))
    const review = civicSupportingConversation(this.civicTeam, 'service-review', new Date())
    const reviewIds = new Set(['service-live', 'service-decision', 'service-followup', 'service-check', 'service-archive'])
    review.tasks = visible ? main.tasks.filter(task => reviewIds.has(task.id)) : []
    review.events = visible ? main.events.filter(event => !event.taskId || reviewIds.has(event.taskId)) : []
    if (visible) review.whiteboard = { ...main.whiteboard!, title: '便民服务 · 复盘台账' }
    this.replaceConversations([main, review])
  }
  private recordActivities(main: DashboardConversation, previous?: DashboardConversation, changed = true, at = new Date().toISOString()) {
    const events: DashboardSnapshot['events'] = [], tasks = new Map(previous?.tasks.map(task => [task.id, task]))
    const add = (kind: DashboardSnapshot['events'][number]['kind'], summary: string, employeeId: string, taskId = '', fromEmployeeId = '') => {
      events.push({ id: `civic-activity-${++this.activitySequence}`, kind, summary, employeeId, taskId, fromEmployeeId, occurredAt: at })
    }
    for (const task of main.tasks) {
      const before = tasks.get(task.id), employeeId = task.assigneeId ?? ''
      if (before && before.status === task.status && before.assigneeId === task.assigneeId && before.title === task.title && before.summary === task.summary && before.progress === task.progress) { task.updatedAt = before.updatedAt; continue }
      if (before?.status === task.status && before.assigneeId === task.assigneeId) continue
      if (task.status === 'running') {
        if (before?.status === 'queued' && this.assignedTasks.has(task.id)) add('task.assigned', `收到负责人安排：${task.title}`, employeeId, task.id, 'office-lead')
        add('task.started', `开始执行：${task.title}`, employeeId, task.id)
      } else if (task.status === 'completed') add('task.completed', `已完成：${task.title}`, employeeId, task.id)
      else if (task.status === 'blocked') add('task.blocked', `${['paused', 'rejected', 'expired', 'stopped'].includes(this.stage) ? '暂不继续' : '等待处理'}：${task.title}`, employeeId, task.id)
      else add('note', `${task.id === 'service-check' || task.id === 'service-archive' ? '等待前序结果' : '待命，等待安排'}：${task.title}`, employeeId, task.id)
    }
    if (changed) for (const event of main.events) add(event.kind, event.summary, event.employeeId ?? '')
    main.events = [...events.reverse(), ...(previous?.events ?? [])].slice(0, 500)
  }
  reply(request: ChatRequest) {
    const question = request.messages.at(-1)?.content ?? ''
    const disclaimer = '\n\n这是本地公务流程预览，不连接真实政务或 AI 服务，不发布通知、不办理真实事项，也不保存居民个人信息。'
    if (/材料|通知|时间|地点/.test(question)) return `## 服务材料与安排\n\n- 事项：${civicCase.title}\n- 地点：${civicCase.location}\n- 时间：${civicCase.time}\n- 材料：诉求分类清单、材料准备清单、服务通知、岗位表、回访记录\n\n通知与岗位方案须确认后才模拟执行。${disclaimer}`
    if (/数据|结果|办结|复盘|效果/.test(question)) return this.getConversations().find(item => item.id === 'main')!.tasks.some(task => task.id === 'service-live' && task.status === 'completed')
      ? `## 服务台账\n\n${civicResultTable(this.stage === 'completed' ? this.strategy : undefined)}${disclaimer}`
      : `当前尚未形成完整的现场服务台账。方案确认并完成现场跟进后再汇总，不预先填写办结数量。${disclaimer}`
    return `当前事项是 **${civicCase.title}**。\n\n${civicConversation(this.civicTeam, this.stage, new Date(), this.strategy).whiteboard!.description}\n\n可以查看材料清单、岗位分工、当前进度和服务台账。${disclaimer}`
  }
}
