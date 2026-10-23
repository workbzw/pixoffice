import type { DashboardSnapshot } from '@pixoffice/protocol/dashboard'

export function actorInsightSubject(dashboard: DashboardSnapshot | null | undefined, actorId: string, selectedEmployeeId = '') {
  const employees = dashboard?.employees.filter(employee => employee.sceneActorId === actorId) ?? []
  const primary = dashboard?.tasks.find(task => task.status === 'running' && employees.some(employee => employee.id === task.assigneeId))
  const employee = employees.find(item => item.id === selectedEmployeeId) ?? employees.find(item => item.id === primary?.assigneeId) ?? employees[0]
  const task = employee ? dashboard?.tasks.find(item => item.assigneeId === employee.id && item.status === 'running') : undefined
  return { employees, employee, task }
}
