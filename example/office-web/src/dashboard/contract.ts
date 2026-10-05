import { z } from 'zod'

const id = z.string().min(1).max(100)
const timestamp = z.iso.datetime({ offset: true })

export const dashboardSnapshotSchema = z.strictObject({
  schemaVersion: z.literal('1.0'),
  workspace: z.strictObject({ id, name: z.string().min(1).max(80) }),
  employees: z.array(z.strictObject({
    id, sceneActorId: id.optional(), name: z.string().min(1).max(80),
    role: z.string().max(80).optional(), online: z.boolean().optional(),
  })).max(200),
  tasks: z.array(z.strictObject({
    id, title: z.string().min(1).max(160), assigneeId: id.optional(),
    status: z.enum(['queued', 'running', 'blocked', 'completed', 'failed']),
    progress: z.number().min(0).max(100).optional(),
    updatedAt: timestamp, summary: z.string().max(1000).optional(),
  })).max(1000),
  events: z.array(z.strictObject({
    id, kind: z.enum(['note', 'task.assigned', 'task.started', 'task.blocked', 'task.completed']),
    summary: z.string().min(1).max(300), occurredAt: timestamp,
    taskId: id.optional(), employeeId: id.optional(), fromEmployeeId: id.optional(),
  })).max(500),
  system: z.strictObject({
    cpuPercent: z.number().min(0).max(100).optional(),
    memoryPercent: z.number().min(0).max(100).optional(),
    networkKbps: z.number().nonnegative().optional(),
  }).optional(),
}).superRefine((snapshot, context) => {
  const employees = new Set(snapshot.employees.map(employee => employee.id))
  const taskIds = new Set(snapshot.tasks.map(task => task.id))
  if (employees.size !== snapshot.employees.length) context.addIssue({ code: 'custom', message: '员工 ID 重复', path: ['employees'] })
  if (taskIds.size !== snapshot.tasks.length) context.addIssue({ code: 'custom', message: '任务 ID 重复', path: ['tasks'] })
  for (const [index, task] of snapshot.tasks.entries()) {
    if (task.assigneeId && !employees.has(task.assigneeId)) context.addIssue({ code: 'custom', message: '任务负责人不存在', path: ['tasks', index, 'assigneeId'] })
  }
})

export type DashboardSnapshot = z.infer<typeof dashboardSnapshotSchema>
export type DashboardTask = DashboardSnapshot['tasks'][number]
export type DashboardAction =
  | { type: 'task.start' | 'task.block' | 'task.complete'; taskId: string }
  | { type: 'task.assign'; taskId: string; assigneeId: string }

export interface OfficeDataSource {
  readonly kind: string
  getSnapshot(): Promise<DashboardSnapshot>
  subscribe(listener: () => void): () => void
  execute(action: DashboardAction): Promise<void>
}

export function parseDashboardSnapshot(value: unknown): DashboardSnapshot {
  return dashboardSnapshotSchema.parse(value)
}
