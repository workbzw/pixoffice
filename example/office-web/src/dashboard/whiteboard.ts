import type { DashboardSnapshot } from '@pixoffice/protocol/dashboard'
import type { WhiteboardTaskBoardData } from '@pixoffice/scene-office/whiteboard'

export function dashboardWhiteboardTaskBoard(data: DashboardSnapshot): WhiteboardTaskBoardData {
  const coding = ['login-plan', 'login-api', 'login-page', 'login-integration', 'login-review'].every(id => data.tasks.some(task => task.id === id))
  const groups = coding ? [
    { id: 'plan', title: '需求与方案', ids: ['login-plan'] },
    { id: 'develop', title: '功能开发', ids: ['login-api', 'login-page'] },
    { id: 'verify', title: '测试与审查', ids: ['login-integration', 'login-review'] },
  ] : data.tasks.slice(0, 3).map(task => ({ id: task.id, title: task.title, ids: [task.id] }))
  const steps = groups.map(group => {
    const values = data.tasks.filter(task => group.ids.includes(task.id)).map(task => task.progress !== undefined && task.progress >= 0 ? task.progress : task.status === 'completed' ? 100 : undefined)
    const progress = values.length && values.every(value => value !== undefined) ? Math.round(values.reduce<number>((sum, value) => sum + value!, 0) / values.length) : undefined
    return { id: group.id, title: group.title, ...(progress === undefined ? {} : { progress }) }
  })
  const status = data.tasks.length && data.tasks.every(task => task.status === 'completed') ? 'completed'
    : data.tasks.some(task => task.status === 'running') ? 'running'
    : data.tasks.some(task => task.status === 'blocked') ? 'blocked'
    : data.tasks.some(task => task.status === 'failed') ? 'failed' : 'queued'
  return { template: 'task-board-v1', title: data.workspace.name, status, tagline: '把计划变成成果',
    description: coding ? '确认需求，完成前后端开发，联调测试并通过安全审查。' : '围绕当前目标，分步推进任务与验收。',
    note: coding ? '先跑通核心流程，再完善边界与体验。' : '对齐目标，分步推进，及时验收。', steps }
}
