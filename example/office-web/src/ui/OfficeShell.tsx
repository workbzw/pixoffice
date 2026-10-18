import { useState } from 'react'
import type { ReactNode } from 'react'
import { Blocks, Braces, Download, FileJson, Globe, House, ListTodo, Plug, SlidersHorizontal, Users } from 'lucide-react'
import type { DashboardAction, DashboardSnapshot, DashboardTask, OfficeDataSource } from '@pixoffice/protocol/dashboard'
import { dashboardMetrics } from '../dashboard/selectors.ts'
import { CharacterAvatar } from '../components/CharacterArtwork.tsx'
import type { ScenePanel } from '../components/SceneControlPanel.tsx'
import '../components/RuntimeWorkspace.css'

type Section = 'overview' | 'tasks' | 'employees' | ScenePanel
const taskStatuses: Record<DashboardTask['status'], string> = {
  queued: '待开始', running: '进行中', blocked: '待处理', completed: '已完成', failed: '失败',
}

function formatTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export interface OfficeShellProps {
  connection: string
  dashboard: DashboardSnapshot | null
  dashboardError: string | null
  sceneLinkError: string | null
  dataMode: OfficeDataSource['kind']
  canExecuteActions?: boolean
  onInspectEmployee?: (employeeId: string) => void
  executeAction: (action: DashboardAction) => Promise<void>
  pendingTaskIds: readonly string[]
  actionError: string | null
  appearanceIds: Readonly<Record<string, string>>
  scene: ReactNode
  editing: boolean
  persistenceError?: string | null
  canRecoverLayout: boolean
  recoverLayout: () => void
  exportCapabilities: () => void
  exportSnapshot: () => void
  renderScenePanel: (panel: ScenePanel) => ReactNode
  hasOffice?: boolean
}
export function OfficeShell({ connection, dashboard, dashboardError, sceneLinkError, dataMode, executeAction,
  pendingTaskIds, actionError, appearanceIds, scene, editing, persistenceError, canRecoverLayout, recoverLayout, exportCapabilities, exportSnapshot, renderScenePanel, hasOffice = true, canExecuteActions = true, onInspectEmployee }: OfficeShellProps) {
  const [section, setSection] = useState<Section>('overview')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [layoutError, setLayoutError] = useState<string | null>(null)
  const metrics = dashboard && dashboardMetrics(dashboard)
  const employees = dashboard?.employees ?? []
  const shownTasks = [...(dashboard?.tasks ?? [])]
    .sort((a, b) => {
      const rank: Record<DashboardTask['status'], number> = { running: 0, blocked: 1, queued: 2, failed: 3, completed: 4 }
      return rank[a.status] - rank[b.status] || Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
    })
  const flowTasks = section === 'overview' ? shownTasks.filter(task => task.status !== 'completed').slice(0, 6) : shownTasks
  const nav = [
    { id: 'overview' as const, label: '首页', icon: House },
    { id: 'tasks' as const, label: '任务中心', icon: ListTodo, count: shownTasks.filter(task => task.status !== 'completed').length },
    { id: 'employees' as const, label: 'AI 员工', icon: Users, count: employees.length },
    { id: 'controls' as const, label: '场景控制', icon: SlidersHorizontal },
    { id: 'plugins' as const, label: '插件', icon: Plug },
    { id: 'protocol' as const, label: '协议', icon: Braces },
  ]
  const runAction = (action: DashboardAction) => { void executeAction(action).catch(() => {}) }
  const resource = (label: string, value: number | undefined, tone: string) => <div className="runtime-resource-row" key={label}><span>{label}</span><div className="runtime-meter"><i className={tone} style={{ width: `${Math.max(0, value ?? 0)}%` }} /></div><strong>{value === undefined || value < 0 ? '—' : `${Math.round(value)}%`}</strong></div>

  return <div className={`runtime-workspace ${editing ? 'map-editing' : ''}`}>
    <aside className="runtime-sidebar">
      <a className="runtime-brand" href={import.meta.env.BASE_URL} title="返回官网"><img className="runtime-brand-title" src={`${import.meta.env.BASE_URL}brand/title.png`} width={2172} height={724} alt="PixOffice 官网" /></a>
      <nav aria-label="主导航" className="runtime-nav">
        {nav.map(item => <button key={item.id} type="button" disabled={!hasOffice && ['controls', 'plugins', 'protocol'].includes(item.id)} className={section === item.id ? 'selected' : ''} aria-current={section === item.id ? 'page' : undefined} onClick={() => setSection(item.id)}><item.icon size={17} strokeWidth={1.8} /><span>{item.label}</span>{item.count !== undefined && item.count > 0 && <small>{item.count}</small>}</button>)}
        <a href={`${import.meta.env.BASE_URL}minimal/`}><Blocks size={17} strokeWidth={1.8} /><span>最小装配</span></a>
        <a href={import.meta.env.BASE_URL}><Globe size={17} strokeWidth={1.8} /><span>官网首页</span></a>
      </nav>

      <div className="runtime-sidebar-middle">
        <div className="runtime-section-title">团队成员 <span>{employees.length}</span></div>
        <div className="runtime-people">{employees.length ? employees.map(employee => <button key={employee.id} className="runtime-person" type="button" onClick={() => onInspectEmployee ? onInspectEmployee(employee.id) : setSection('employees')}><CharacterAvatar appearanceId={employee.sceneActorId ? appearanceIds[employee.sceneActorId] : undefined} /><span><strong>{employee.name}</strong><small>{employee.role ?? '成员'}</small></span><i className={`runtime-presence ${employee.online === true ? 'online' : ''}`} /></button>) : <p className="runtime-muted">尚无员工数据</p>}</div>
      </div>

      <footer className="runtime-footer"><span>{dataMode === 'example' ? '示例业务数据' : dashboardError ? '业务数据未连接' : dashboard ? '业务数据已连接' : '业务数据连接中'}</span><small>消息连接：{connection}</small></footer>
    </aside>

    <div className="runtime-center">
      <header className="runtime-stats" aria-label="工作空间概况">
        <div className="runtime-stat"><span>进行中</span><strong>{metrics?.running ?? '—'}</strong><small>当前任务</small></div>
        <div className="runtime-stat"><span>已完成</span><strong>{metrics?.completedToday ?? '—'}</strong><small>今日完成</small></div>
        <div className="runtime-stat"><span>待处理</span><strong>{metrics?.blocked ?? '—'}</strong><small>阻塞任务</small></div>
        <div className="runtime-stat"><span>AI 员工</span><strong>{metrics ? metrics.onlineKnown ? `${metrics.online}/${metrics.employeeTotal}` : `—/${metrics.employeeTotal}` : '—'}</strong><small>{metrics?.onlineKnown ? '在线人数' : '在线状态未提供'}</small></div>
        <div className="runtime-stat runtime-system"><span>系统资源</span>{resource('CPU', dashboard?.system?.cpuPercent, 'cpu')}{resource('内存', dashboard?.system?.memoryPercent, 'memory')}<div className="runtime-resource-row"><span>网络</span><em>{dashboard?.system?.networkKbps === undefined || dashboard.system.networkKbps < 0 ? '未提供' : `${dashboard.system.networkKbps} KB/s`}</em></div></div>
      </header>
      {(dashboardError || sceneLinkError || persistenceError || actionError || layoutError) && <div className="runtime-alert" role="alert"><span>{dashboardError && `业务数据：${dashboardError}`}{sceneLinkError && `场景同步：${sceneLinkError}`}{persistenceError && `场景存档：${persistenceError}`}{actionError && `操作失败：${actionError}`}{layoutError && `布局恢复：${layoutError}`}</span>{canRecoverLayout && <button onClick={() => { try { recoverLayout(); setLayoutError(null) } catch (cause) { setLayoutError(String(cause)) } }}>备份并恢复布局</button>}</div>}
      {scene}
    </div>

    <aside className="runtime-inspector">
      {section === 'overview' || section === 'tasks' ? <div className="runtime-inspector-scroll">
        <div className="runtime-panel-heading"><h2>{section === 'overview' ? '当前任务流' : '任务中心'}</h2><span>{flowTasks.length}</span></div>
        {!dashboard && <p className="runtime-empty">{hasOffice ? '正在连接业务数据…' : '暂无办公室'}</p>}
        {dashboard && !flowTasks.length && <p className="runtime-empty">当前没有待执行任务</p>}
        <div className="runtime-task-list">{flowTasks.map(task => {
          const expanded = selectedTaskId === task.id
          const assignee = employees.find(employee => employee.id === task.assigneeId)
          return <article className={`runtime-task ${expanded ? 'expanded' : ''}`} key={task.id}>
            <button type="button" className="runtime-task-summary" aria-expanded={expanded} onClick={() => setSelectedTaskId(expanded ? null : task.id)}><span><strong>{task.title}</strong><small>{assignee?.name ?? '未分配'}</small></span><em className={`status-${task.status}`}>{taskStatuses[task.status]}</em></button>
            <div className="runtime-task-meter"><i style={{ width: `${Math.max(0, task.progress ?? 0)}%` }} /></div><small className="runtime-task-progress">{task.progress === undefined || task.progress < 0 ? '进度未提供' : `${Math.round(task.progress)}%`}</small>
            {expanded && <div className="runtime-task-detail">{task.summary && <p>{task.summary}</p>}<span>更新于 {formatTime(task.updatedAt)}</span>{canExecuteActions && task.status !== 'completed' && <><label>负责人<select aria-label={`${task.title}的负责人`} disabled={pendingTaskIds.includes(task.id)} value={task.assigneeId ?? ''} onChange={event => { runAction({ type: 'task.assign', taskId: task.id, assigneeId: event.target.value }) }}><option value="" disabled>未分配</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label><div className="runtime-task-actions">{(task.status === 'queued' || task.status === 'blocked') && <button disabled={pendingTaskIds.includes(task.id)} onClick={() => runAction({ type: 'task.start', taskId: task.id })}>开始任务</button>}{task.status === 'running' && <button disabled={pendingTaskIds.includes(task.id)} onClick={() => runAction({ type: 'task.block', taskId: task.id })}>标记阻塞</button>}{(task.status === 'running' || task.status === 'blocked') && <button disabled={pendingTaskIds.includes(task.id)} onClick={() => runAction({ type: 'task.complete', taskId: task.id })}>完成任务</button>}</div></>}</div>}
          </article>
        })}</div>
        <div className="runtime-panel-heading runtime-events-heading"><h2>实时动态</h2></div>
        <ol className="runtime-event-list">{(dashboard?.events ?? []).slice(0, 12).map(event => <li key={event.id}><span className="runtime-event-dot" /><div><p><strong>{employees.find(employee => employee.id === event.employeeId)?.name ?? '系统'}</strong> {event.summary}</p><time dateTime={event.occurredAt}>{formatTime(event.occurredAt)}</time></div></li>)}</ol>
        {dashboard && !dashboard.events.length && <p className="runtime-empty">暂无动态</p>}
        <div className="runtime-panel-heading runtime-tools-heading"><h2>快捷工具</h2></div>
        <div className="runtime-quick-tools"><button disabled={!hasOffice} onClick={() => exportCapabilities()}><FileJson size={19} />场景协议</button><button disabled={!hasOffice} onClick={() => exportSnapshot()}><Download size={19} />导出快照</button></div>
      </div> : section === 'employees' ? <div className="runtime-inspector-scroll"><div className="runtime-panel-heading"><h2>团队成员</h2><span>{employees.length}</span></div><div className="runtime-employee-list">{employees.map(employee => {
        const task = shownTasks.find(item => item.assigneeId === employee.id && item.status === 'running')
        return <div className="runtime-employee" key={employee.id}><CharacterAvatar appearanceId={employee.sceneActorId ? appearanceIds[employee.sceneActorId] : undefined} /><div><strong>{employee.name}</strong><small>{employee.role ?? '成员'} · {employee.online === undefined ? '在线状态未知' : employee.online ? '在线' : '离线'}</small><p>{task?.title ?? '当前无执行任务'}</p></div></div>
      })}</div></div> : renderScenePanel(section)}
    </aside>
  </div>
}
