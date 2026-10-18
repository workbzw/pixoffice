import type { ActorTaskPresentation } from '@pixoffice/contracts/presentation'
import type { DashboardSnapshot, DashboardTask } from '@pixoffice/protocol/dashboard'

const priority = { running: 4, blocked: 3, failed: 2, queued: 1, completed: 0 }

const compareTasks = (a: DashboardTask, b: DashboardTask) => priority[b.status] - priority[a.status]
  || Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
  || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** A display slot can serve multiple business functions without changing their task ownership. */
export function officeActorPrimaryTasks(data: DashboardSnapshot | null): Map<string, DashboardTask> {
  const result = new Map<string, DashboardTask>()
  if (!data) return result
  const actorByEmployee = new Map(data.employees.map(employee => [employee.id, employee.sceneActorId]))
  for (const task of data.tasks) {
    const actorId = task.assigneeId && actorByEmployee.get(task.assigneeId)
    if (!actorId) continue
    const current = result.get(actorId)
    if (!current || compareTasks(task, current) < 0) result.set(actorId, task)
  }
  return result
}

export function officeActorTasks(data: DashboardSnapshot | null): Map<string, ActorTaskPresentation> {
  return new Map([...officeActorPrimaryTasks(data)].map(([actorId, task]) => [actorId,
    { id: task.id, title: task.title, detail: task.summary, status: task.status, progress: task.progress, progressMode: 'activity' }]))
}
