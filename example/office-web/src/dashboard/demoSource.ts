import type { DashboardAction, DashboardSnapshot, OfficeDataSource } from './contract.ts'
import { parseDashboardSnapshot } from './contract.ts'

const initialEmployees: DashboardSnapshot['employees'] = [
  { id: 'marvis', sceneActorId: 'marvis', name: '王明', role: '负责人', online: true },
  { id: 'code-agent', sceneActorId: 'code-agent', name: '李研', role: '信息检索', online: true },
  { id: 'file-agent', sceneActorId: 'file-agent', name: '周理', role: '资料整理', online: true },
  { id: 'app-agent', sceneActorId: 'app-agent', name: '陈书', role: '文案撰写', online: true },
  { id: 'review-agent', sceneActorId: 'review-agent', name: '刘市', role: '市场分析', online: true },
  { id: 'data-agent', sceneActorId: 'data-agent', name: '赵审', role: '内容审核', online: true },
]

export class ExampleOfficeDataSource implements OfficeDataSource {
  readonly kind = 'example'
  private listeners = new Set<() => void>()
  private snapshot: DashboardSnapshot

  constructor(now = new Date()) {
    const at = now.toISOString()
    this.snapshot = parseDashboardSnapshot({
      schemaVersion: '1.0', workspace: { id: 'office-1', name: '我的空间' },
      employees: initialEmployees,
      tasks: [
        { id: 'market-research', title: '市场调研', assigneeId: 'code-agent', status: 'running', progress: 72, updatedAt: at, summary: '梳理近期市场与竞品信息。' },
        { id: 'copywriting', title: '文案撰写', assigneeId: 'app-agent', status: 'running', progress: 60, updatedAt: at, summary: '整理调研结果并起草文案。' },
        { id: 'compliance', title: '合规审核', assigneeId: 'data-agent', status: 'blocked', progress: 30, updatedAt: at, summary: '等待补充来源材料。' },
        { id: 'report', title: '打包汇报', assigneeId: 'review-agent', status: 'queued', progress: 0, updatedAt: at, summary: '等待上游任务完成。' },
        { id: 'archive', title: '资料归档', assigneeId: 'file-agent', status: 'completed', progress: 100, updatedAt: at },
      ],
      events: [
        { id: 'example-1', kind: 'note', employeeId: 'code-agent', taskId: 'market-research', summary: '开始梳理市场资料', occurredAt: at },
        { id: 'example-2', kind: 'note', employeeId: 'app-agent', taskId: 'copywriting', summary: '正在起草文案', occurredAt: at },
        { id: 'example-3', kind: 'note', employeeId: 'data-agent', taskId: 'compliance', summary: '等待补充来源材料', occurredAt: at },
      ],
    })
  }

  async getSnapshot() { return structuredClone(this.snapshot) }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }

  async execute(action: DashboardAction) {
    const task = this.snapshot.tasks.find(item => item.id === action.taskId)
    if (!task) throw new Error('任务不存在')
    const employee = action.type === 'task.assign' ? this.snapshot.employees.find(item => item.id === action.assigneeId) : undefined
    if (action.type === 'task.assign' && !employee) throw new Error('员工不存在')
    if (action.type === 'task.start' && (task.status !== 'queued' && task.status !== 'blocked')) throw new Error('只有待开始或阻塞的任务可以启动')
    if (action.type === 'task.block' && task.status !== 'running') throw new Error('只有运行中的任务可以标记为阻塞')
    if (action.type === 'task.complete' && !['running', 'blocked'].includes(task.status)) throw new Error('任务尚未开始')
    if (action.type === 'task.assign' && (task.assigneeId === employee!.id || task.status === 'completed')) throw new Error('任务无需重新分配')

    if (action.type === 'task.assign') {
      task.assigneeId = employee!.id
      task.status = 'queued'
      task.progress = 0
    } else if (action.type === 'task.start') task.status = 'running'
    else if (action.type === 'task.block') task.status = 'blocked'
    else { task.status = 'completed'; task.progress = 100 }
    task.updatedAt = new Date().toISOString()
    this.snapshot.events.unshift({
      id: globalThis.crypto.randomUUID(),
      kind: action.type === 'task.assign' ? 'task.assigned' : action.type === 'task.start' ? 'task.started' : action.type === 'task.block' ? 'task.blocked' : 'task.completed',
      taskId: task.id, employeeId: task.assigneeId, fromEmployeeId: action.type === 'task.assign' ? 'marvis' : undefined,
      summary: action.type === 'task.assign' ? `任务已交给${employee!.name}` : action.type === 'task.start' ? '开始执行任务' : action.type === 'task.block' ? '任务遇到阻塞' : '任务已完成',
      occurredAt: task.updatedAt,
    })
    this.snapshot.events = this.snapshot.events.slice(0, 100)
    for (const listener of this.listeners) listener()
  }
}
