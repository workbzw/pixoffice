import type { DashboardSnapshot } from './contract.ts'

export function dashboardMetrics(data: DashboardSnapshot, now = new Date()) {
  const today = now.toLocaleDateString('en-CA')
  return {
    running: data.tasks.filter(task => task.status === 'running').length,
    completedToday: data.tasks.filter(task => task.status === 'completed' && new Date(task.updatedAt).toLocaleDateString('en-CA') === today).length,
    blocked: data.tasks.filter(task => task.status === 'blocked').length,
    online: data.employees.filter(employee => employee.online === true).length,
    employeeTotal: data.employees.length,
    onlineKnown: data.employees.every(employee => employee.online !== undefined),
  }
}
