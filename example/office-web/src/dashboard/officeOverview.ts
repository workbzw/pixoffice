import type { DashboardConversation, DashboardSnapshot } from '@pixoffice/protocol/dashboard'

export interface OfficeActivityOverview {
  running: boolean
  status: 'unknown' | 'attention' | 'running' | 'completed' | 'idle'
  goal: string
  latestActivity: string
}

export function officeActivityOverview(conversations: readonly Pick<DashboardConversation, 'tasks' | 'events' | 'whiteboard'>[],
  current: DashboardSnapshot | null, pendingDecisions = 0, unavailable = false): OfficeActivityOverview {
  const scopes = conversations.length ? conversations : current ? [current] : []
  const tasks = scopes.flatMap(scope => scope.tasks)
  const running = !unavailable && tasks.some(task => task.status === 'running')
  const attention = pendingDecisions > 0 || tasks.some(task => task.status === 'blocked' || task.status === 'failed')
  const latest = scopes.flatMap(scope => scope.events).reduce<DashboardSnapshot['events'][number] | undefined>((previous, event) =>
    !previous || Date.parse(event.occurredAt) > Date.parse(previous.occurredAt) ? event : previous, undefined)
  return { running, status: unavailable || !scopes.length ? 'unknown' : attention ? 'attention' : running ? 'running'
    : tasks.length && tasks.every(task => task.status === 'completed') ? 'completed' : 'idle',
    goal: scopes.find(scope => scope.tasks.some(task => task.status === 'running') && scope.whiteboard?.title)?.whiteboard?.title
      || current?.whiteboard?.title || scopes.find(scope => scope.whiteboard?.title)?.whiteboard?.title || '',
    latestActivity: latest?.summary ?? '' }
}

export function officeOverview(snapshot: DashboardSnapshot | null) {
  const tasks = snapshot?.tasks ?? []
  const running = tasks.filter(task => task.status === 'running').length
  const completed = tasks.filter(task => task.status === 'completed').length
  const attention = tasks.filter(task => task.status === 'blocked' || task.status === 'failed').length
  return { total: tasks.length, running, completed, attention,
    status: !snapshot ? '等待初始化' : attention ? '需要关注' : running ? '协作进行中' : tasks.length && completed === tasks.length ? '任务已完成' : '准备就绪',
    goal: snapshot?.whiteboard?.title || '当前会话暂无目标',
  }
}
