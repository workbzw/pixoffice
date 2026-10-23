import { z } from 'zod'
import { idSchema } from './schema.ts'
import { whiteboardTaskBoardSchema } from './office-ui.ts'
import { agentInsightsSchema } from './agent-insights.ts'
// Optional office dashboard domain; other scene products need not import it.

const id = z.string().min(1).max(100)
const businessReference = z.string().max(100).optional()
const actorReference = z.union([idSchema, z.literal('')]).optional()
const timestamp = z.iso.datetime({ offset: true })

export const maxOfficeMembers = 6
export const officeMemberLimitMessage = `办公室已满，最多 ${maxOfficeMembers} 位成员`
export function officeMemberOccupancy(conversations: readonly { employees: readonly { id: string; sceneActorId?: string }[] }[]) {
  const memberIds = new Set<string>(), actorIds = new Set<string>()
  for (const conversation of conversations) for (const employee of conversation.employees) {
    memberIds.add(employee.id)
    if (employee.sceneActorId) actorIds.add(employee.sceneActorId)
  }
  return { memberIds, actorIds }
}

export const officeMemberInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(80), role: z.string().trim().max(80).default(''), sceneActorId: idSchema,
})
export type OfficeMemberInput = z.infer<typeof officeMemberInputSchema>

export const dashboardSnapshotSchema = z.strictObject({
  schemaVersion: z.literal('1.0'),
  conversationId: id.optional(),
  seq: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
  workspace: z.strictObject({ id, name: z.string().min(1).max(80) }),
  employees: z.array(z.strictObject({
    id, sceneActorId: actorReference, name: z.string().min(1).max(80),
    role: z.string().max(80).optional(), online: z.boolean().optional(),
    insights: agentInsightsSchema.optional(),
  })).max(200),
  tasks: z.array(z.strictObject({
    id, title: z.string().min(1).max(160), assigneeId: businessReference,
    status: z.enum(['queued', 'running', 'blocked', 'completed', 'failed']),
    progress: z.union([z.literal(-1), z.number().min(0).max(100)]).optional(),
    updatedAt: timestamp, summary: z.string().max(1000).optional(),
  })).max(1000),
  events: z.array(z.strictObject({
    id, kind: z.enum(['note', 'task.assigned', 'task.started', 'task.blocked', 'task.completed']),
    summary: z.string().min(1).max(300), occurredAt: timestamp,
    taskId: businessReference, employeeId: businessReference, fromEmployeeId: businessReference,
  })).max(500),
  system: z.strictObject({
    cpuPercent: z.union([z.literal(-1), z.number().min(0).max(100)]).optional(),
    memoryPercent: z.union([z.literal(-1), z.number().min(0).max(100)]).optional(),
    networkKbps: z.union([z.literal(-1), z.number().nonnegative()]).optional(),
  }).optional(),
  whiteboard: whiteboardTaskBoardSchema.optional(),
}).superRefine(validateDashboardSnapshot)

export function validateDashboardSnapshot(snapshot: { employees: { id: string }[]; tasks: { id: string; assigneeId?: string }[] }, context: z.RefinementCtx) {
  const employees = new Set(snapshot.employees.map(employee => employee.id))
  const taskIds = new Set(snapshot.tasks.map(task => task.id))
  if (employees.size !== snapshot.employees.length) context.addIssue({ code: 'custom', message: '员工 ID 重复', path: ['employees'] })
  if (taskIds.size !== snapshot.tasks.length) context.addIssue({ code: 'custom', message: '任务 ID 重复', path: ['tasks'] })
  for (const [index, task] of snapshot.tasks.entries()) {
    if (task.assigneeId && !employees.has(task.assigneeId)) context.addIssue({ code: 'custom', message: '任务负责人不存在', path: ['tasks', index, 'assigneeId'] })
  }
}

export type DashboardSnapshot = z.input<typeof dashboardSnapshotSchema>
export type DashboardConversation = Pick<DashboardSnapshot, 'employees' | 'tasks' | 'events' | 'whiteboard'> & { id: string; title: string }
export type DashboardTask = DashboardSnapshot['tasks'][number]
export type DashboardAction =
  | { type: 'task.start' | 'task.block' | 'task.complete'; taskId: string }
  | { type: 'task.assign'; taskId: string; assigneeId: string }

export interface OfficeDataSource {
  readonly kind: string
  readonly canExecute?: boolean
  readonly replayEvents?: boolean
  getSnapshot(): Promise<DashboardSnapshot>
  getConversations?(): readonly DashboardConversation[]
  selectConversation?(id: string): void
  createEmployee?(input: OfficeMemberInput): Promise<void>
  subscribe(listener: () => void): () => void
  execute(action: DashboardAction): Promise<void>
}

export function parseDashboardSnapshot(value: unknown): DashboardSnapshot {
  return dashboardSnapshotSchema.parse(value)
}
