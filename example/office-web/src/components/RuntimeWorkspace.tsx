import { useMemo, useState, useSyncExternalStore } from 'react'
import { Braces, Download, FileJson, House, ListTodo, Plug, Search, SlidersHorizontal, Users } from 'lucide-react'
import type { DashboardAction, DashboardSnapshot, DashboardTask, OfficeDataSource } from '../dashboard/contract.ts'
import { dashboardMetrics } from '../dashboard/selectors.ts'
import type { OfficeRuntime } from '@pixoffice/runtime/OfficeRuntime'
import { OfficeCanvas } from './OfficeCanvas.tsx'
import { CharacterAvatar } from './CharacterArtwork.tsx'
import { SceneControlPanel, type ScenePanel } from './SceneControlPanel.tsx'
import { initialMapView } from './map-editor/commands.ts'
import { OfficeChat } from './OfficeChat.tsx'
import type { OfficeChatSource } from '../chat/contract.ts'
import './RuntimeWorkspace.css'

type Section = 'overview' | 'tasks' | 'employees' | ScenePanel
const taskStatuses: Record<DashboardTask['status'], string> = {
  queued: '待开始', running: '进行中', blocked: '待处理', completed: '已完成', failed: '失败',
}

function download(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url)
}

function formatTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function RuntimeWorkspace({ runtime, connection, dashboard, dashboardError, sceneLinkError, dataMode, executeAction, chatSource }: {
  runtime: OfficeRuntime
  connection: string
  dashboard: DashboardSnapshot | null
  dashboardError: string | null
  sceneLinkError: string | null
  dataMode: OfficeDataSource['kind']
  executeAction: (action: DashboardAction) => Promise<void>
  chatSource: OfficeChatSource
}) {
  const revision = useSyncExternalStore(runtime.subscribe, runtime.getRevision)
  const scene = useMemo(() => { void revision; return runtime.snapshot() }, [runtime, revision])
  const [section, setSection] = useState<Section>('overview')
  const [search, setSearch] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null)
  const [mapView, setMapView] = useState(initialMapView)
  const [chatExpanded, setChatExpanded] = useState(false)
  const metrics = dashboard && dashboardMetrics(dashboard)
  const employees = dashboard?.employees ?? []
  const query = search.trim().toLocaleLowerCase()
  const shownEmployees = employees.filter(employee => `${employee.name} ${employee.role ?? ''}`.toLocaleLowerCase().includes(query))
  const shownTasks = (dashboard?.tasks ?? []).filter(task => `${task.title} ${task.summary ?? ''} ${employees.find(employee => employee.id === task.assigneeId)?.name ?? ''}`.toLocaleLowerCase().includes(query))
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
  const runAction = async (action: DashboardAction) => {
    setBusyTaskId(action.taskId); setActionError(null)
    try { await executeAction(action) }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : '业务操作失败') }
    finally { setBusyTaskId(null) }
  }
  const resource = (label: string, value: number | undefined, tone: string) => <div className="runtime-resource-row" key={label}><span>{label}</span><div className="runtime-meter"><i className={tone} style={{ width: `${value ?? 0}%` }} /></div><strong>{value == null ? '—' : `${Math.round(value)}%`}</strong></div>

  return <div className={`runtime-workspace ${scene.editor ? 'map-editing' : ''}`}>
    <aside className="runtime-sidebar">
      <div className="runtime-brand" title="pixoffice.online"><img className="runtime-brand-title" src={`${import.meta.env.BASE_URL}brand/title.png`} width={2172} height={724} alt="PixOffice" /></div>
      <label className="runtime-search"><Search size={16} /><input aria-label="搜索任务或员工" placeholder="搜索任务、员工…" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <nav aria-label="主导航" className="runtime-nav">{nav.map(item => <button key={item.id} type="button" className={section === item.id ? 'selected' : ''} aria-current={section === item.id ? 'page' : undefined} onClick={() => setSection(item.id)}><item.icon size={17} strokeWidth={1.8} /><span>{item.label}</span>{item.count !== undefined && item.count > 0 && <small>{item.count}</small>}</button>)}</nav>

      <div className="runtime-sidebar-middle">
        <div className="runtime-section-title">工作空间</div>
        <div className="runtime-workspace-name"><span className="runtime-presence online" />{dashboard?.workspace.name ?? '等待数据源'}</div>
        <div className="runtime-section-title">团队成员 <span>{employees.length}</span></div>
        <div className="runtime-people">{shownEmployees.length ? shownEmployees.map(employee => <button key={employee.id} className="runtime-person" type="button" onClick={() => setSection('employees')}><CharacterAvatar id={employee.sceneActorId ?? employee.id} /><span><strong>{employee.name}</strong><small>{employee.role ?? '成员'}</small></span><i className={`runtime-presence ${employee.online === true ? 'online' : ''}`} /></button>) : <p className="runtime-muted">{query ? '没有匹配的员工' : '尚无员工数据'}</p>}</div>
      </div>

      <footer className="runtime-footer"><span>{dataMode === 'example' ? '示例业务数据' : dashboardError ? '业务数据未连接' : '业务数据已连接'}</span><small>场景网关：{connection}</small></footer>
    </aside>

    <div className="runtime-center">
      <header className="runtime-stats" aria-label="工作空间概况">
        <div className="runtime-stat"><span>进行中</span><strong>{metrics?.running ?? '—'}</strong><small>当前任务</small></div>
        <div className="runtime-stat"><span>已完成</span><strong>{metrics?.completedToday ?? '—'}</strong><small>今日完成</small></div>
        <div className="runtime-stat"><span>待处理</span><strong>{metrics?.blocked ?? '—'}</strong><small>阻塞任务</small></div>
        <div className="runtime-stat"><span>AI 员工</span><strong>{metrics ? metrics.onlineKnown ? `${metrics.online}/${metrics.employeeTotal}` : `—/${metrics.employeeTotal}` : '—'}</strong><small>{metrics?.onlineKnown ? '在线人数' : '在线状态未提供'}</small></div>
        <div className="runtime-stat runtime-system"><span>系统资源</span>{resource('CPU', dashboard?.system?.cpuPercent, 'cpu')}{resource('内存', dashboard?.system?.memoryPercent, 'memory')}<div className="runtime-resource-row"><span>网络</span><em>{dashboard?.system?.networkKbps == null ? '未提供' : `${dashboard.system.networkKbps} KB/s`}</em></div></div>
      </header>
      {(dashboardError || sceneLinkError || scene.persistenceError || actionError) && <div className="runtime-alert" role="alert"><span>{dashboardError && `业务数据：${dashboardError}`}{sceneLinkError && `场景同步：${sceneLinkError}`}{scene.persistenceError && `场景存档：${scene.persistenceError}`}{actionError && `操作失败：${actionError}`}</span>{scene.canRecoverLayout && <button onClick={() => { try { runtime.recoverLayout() } catch (cause) { setActionError(String(cause)) } }}>备份并恢复布局</button>}</div>}
      <main className="office-main" aria-label="PixOffice 场景">
        <div className="office-stage" inert={chatExpanded && !scene.editor}><OfficeCanvas runtime={runtime} mapView={mapView} setMapView={setMapView} covered={chatExpanded && !scene.editor} /></div>
        <OfficeChat source={chatSource} expanded={chatExpanded && !scene.editor} onExpandedChange={setChatExpanded} hidden={!!scene.editor} leaderId={employees[0]?.sceneActorId ?? 'marvis'} leaderName={employees[0]?.name ?? '办公室负责人'} />
      </main>
    </div>

    <aside className="runtime-inspector">
      {section === 'overview' || section === 'tasks' ? <div className="runtime-inspector-scroll">
        <div className="runtime-panel-heading"><h2>{section === 'overview' ? '当前任务流' : '任务中心'}</h2><span>{flowTasks.length}</span></div>
        {!dashboard && <p className="runtime-empty">正在连接业务数据…</p>}
        {dashboard && !flowTasks.length && <p className="runtime-empty">{query ? '没有匹配的任务' : '当前没有待执行任务'}</p>}
        <div className="runtime-task-list">{flowTasks.map(task => {
          const expanded = selectedTaskId === task.id
          const assignee = employees.find(employee => employee.id === task.assigneeId)
          return <article className={`runtime-task ${expanded ? 'expanded' : ''}`} key={task.id}>
            <button type="button" className="runtime-task-summary" aria-expanded={expanded} onClick={() => setSelectedTaskId(expanded ? null : task.id)}><span><strong>{task.title}</strong><small>{assignee?.name ?? '未分配'}</small></span><em className={`status-${task.status}`}>{taskStatuses[task.status]}</em></button>
            <div className="runtime-task-meter"><i style={{ width: `${task.progress ?? 0}%` }} /></div><small className="runtime-task-progress">{task.progress == null ? '进度未提供' : `${Math.round(task.progress)}%`}</small>
            {expanded && <div className="runtime-task-detail">{task.summary && <p>{task.summary}</p>}<span>更新于 {formatTime(task.updatedAt)}</span>{task.status !== 'completed' && <><label>负责人<select aria-label={`${task.title}的负责人`} disabled={busyTaskId === task.id} value={task.assigneeId ?? ''} onChange={event => { void runAction({ type: 'task.assign', taskId: task.id, assigneeId: event.target.value }) }}><option value="" disabled>未分配</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label><div className="runtime-task-actions">{(task.status === 'queued' || task.status === 'blocked') && <button disabled={busyTaskId === task.id} onClick={() => { void runAction({ type: 'task.start', taskId: task.id }) }}>开始任务</button>}{task.status === 'running' && <button disabled={busyTaskId === task.id} onClick={() => { void runAction({ type: 'task.block', taskId: task.id }) }}>标记阻塞</button>}{(task.status === 'running' || task.status === 'blocked') && <button disabled={busyTaskId === task.id} onClick={() => { void runAction({ type: 'task.complete', taskId: task.id }) }}>完成任务</button>}</div></>}</div>}
          </article>
        })}</div>
        <div className="runtime-panel-heading runtime-events-heading"><h2>实时动态</h2></div>
        <ol className="runtime-event-list">{(dashboard?.events ?? []).filter(event => !query || `${event.summary} ${employees.find(employee => employee.id === event.employeeId)?.name ?? ''}`.toLocaleLowerCase().includes(query)).slice(0, 12).map(event => <li key={event.id}><span className="runtime-event-dot" /><div><p><strong>{employees.find(employee => employee.id === event.employeeId)?.name ?? '系统'}</strong> {event.summary}</p><time dateTime={event.occurredAt}>{formatTime(event.occurredAt)}</time></div></li>)}</ol>
        {dashboard && !dashboard.events.length && <p className="runtime-empty">暂无动态</p>}
        <div className="runtime-panel-heading runtime-tools-heading"><h2>快捷工具</h2></div>
        <div className="runtime-quick-tools"><button onClick={() => download(runtime.describe(), 'scene-capabilities.json')}><FileJson size={19} />场景协议</button><button onClick={() => download(runtime.snapshot(), 'scene-snapshot.json')}><Download size={19} />导出快照</button></div>
      </div> : section === 'employees' ? <div className="runtime-inspector-scroll"><div className="runtime-panel-heading"><h2>团队成员</h2><span>{shownEmployees.length}</span></div><div className="runtime-employee-list">{shownEmployees.map(employee => {
        const task = shownTasks.find(item => item.assigneeId === employee.id && item.status === 'running')
        return <div className="runtime-employee" key={employee.id}><CharacterAvatar id={employee.sceneActorId ?? employee.id} /><div><strong>{employee.name}</strong><small>{employee.role ?? '成员'} · {employee.online === undefined ? '在线状态未知' : employee.online ? '在线' : '离线'}</small><p>{task?.title ?? '当前无执行任务'}</p></div></div>
      })}</div></div> : <SceneControlPanel runtime={runtime} snapshot={scene} panel={section} />}
    </aside>
  </div>
}
