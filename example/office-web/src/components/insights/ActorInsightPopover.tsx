import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Ellipsis, Pin, X } from 'lucide-react'
import type { DashboardSnapshot } from '@pixoffice/protocol/dashboard'
import type { ActorInsightInteraction, ActorInsightSelection } from '../../application/ActorInsightInteraction.ts'
import { placeActorInsights } from '../../application/ActorInsightInteraction.ts'
import { CharacterAvatar } from '../CharacterArtwork.tsx'
import { InsightBlock } from './InsightBlocks.tsx'
import { actorInsightSubject } from '../../dashboard/insightSelectors.ts'
import './ActorInsightPopover.css'

type SceneActor = { id: string; name: string; templateId: string }
export const ActorInsightPopover = memo(function ActorInsightPopover({ selection, interaction, dashboard, actor, example, onActions }: {
  selection: ActorInsightSelection; interaction: ActorInsightInteraction; dashboard?: DashboardSnapshot | null
  actor: SceneActor; example: boolean; onActions?: (actorId: string, employeeId?: string) => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  const [employeeId, setEmployeeId] = useState('')
  const [periodId, setPeriodId] = useState('last7Days')
  const [expanded, setExpanded] = useState(false)
  const [position, setPosition] = useState({ left: -1000, top: -1000, side: 'right', tail: 60 })
  const { employees, employee, task } = actorInsightSubject(dashboard, actor.id, employeeId)
  const insights = employee?.insights
  const period = insights?.periods.find(item => item.id === periodId) ?? insights?.periods[0]
  const chart = period?.blocks.find(block => block.type !== 'activity')
  const activity = period?.blocks.find(block => block.type === 'activity')
  const blocks = expanded ? period?.blocks ?? [] : [chart, activity].filter(block => block !== undefined)

  useLayoutEffect(() => {
    const measure = () => {
      if (!panel.current) return
      const bounds = panel.current.getBoundingClientRect()
      const placed = placeActorInsights({ x: selection.clientX, y: selection.clientY }, bounds, { width: window.innerWidth, height: window.innerHeight })
      setPosition({ ...placed, tail: Math.max(28, Math.min(bounds.height - 28, selection.clientY - placed.top)) })
    }
    const observer = new ResizeObserver(measure)
    if (panel.current) observer.observe(panel.current)
    window.addEventListener('resize', measure); measure()
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [selection.clientX, selection.clientY])

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target)) interaction.close()
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); interaction.close() } }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', escape) }
  }, [interaction])

  return createPortal(<div ref={panel} className={`agent-insight-popover is-${position.side}${selection.pinned ? ' is-pinned' : ''}`}
    data-actor-id={actor.id} role="dialog" aria-label={`${employee?.name ?? actor.name}的成员统计`} aria-modal={false}
    style={{ left: position.left, top: position.top, '--insight-tail-top': `${position.tail}px` } as React.CSSProperties}
    onPointerEnter={() => interaction.retain()} onPointerLeave={() => interaction.leavePopover(actor.id)}
    onFocus={event => { if (!(event.target instanceof Element && event.target.closest('[data-insight-pin]'))) interaction.pin() }}
    onPointerDownCapture={event => { interaction.retain(); if (!(event.target instanceof Element && event.target.closest('[data-insight-pin]'))) interaction.pin() }}>
    <div className="agent-insight-content">
    <header className="agent-insight-header">
      <CharacterAvatar appearanceId={actor.templateId} />
      <div className="agent-insight-identity"><div><h2>{employee?.name ?? actor.name}</h2>{employee && <span className={`agent-insight-presence${employee.online ? ' is-online' : ''}`}>{employee.online === undefined ? '状态未知' : employee.online ? '在线' : '离线'}</span>}</div><p>{employee?.role || '办公室成员'}</p></div>
      <div className="agent-insight-tools"><button type="button" data-insight-pin title={selection.pinned ? '取消固定' : '固定窗口'} aria-label="固定统计窗口" aria-pressed={selection.pinned} onClick={() => interaction.togglePin()}><Pin size={15} /></button>{onActions && <button type="button" title="更多操作" aria-label="更多人物操作" onClick={() => onActions(actor.id, employee?.id)}><Ellipsis size={18} /></button>}<button type="button" title="关闭" aria-label="关闭成员统计" onClick={interaction.close}><X size={16} /></button></div>
    </header>
    {employees.length > 1 && <label className="agent-insight-member">绑定成员<select aria-label="统计成员" value={employee?.id ?? ''} onChange={event => setEmployeeId(event.target.value)}>{employees.map(item => <option key={item.id} value={item.id}>{item.name} · {item.role || '成员'}</option>)}</select></label>}
    <p className="agent-insight-current"><i className={task ? 'is-working' : ''} /><span>{task?.title ?? (employee ? '当前没有执行中的任务' : '尚未绑定业务成员')}</span></p>
    <div className="agent-insight-heading"><h3>成员统计</h3><div>{example && insights && <span className="agent-insight-example">演示统计</span>}{period && <select aria-label="统计时间" value={period.id} onChange={event => setPeriodId(event.target.value)}>{insights?.periods.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>}</div></div>
    {period ? <>
      <dl className="agent-insight-metrics">{period.metrics.map(metric => <div key={metric.id}>
        <dt>{metric.label}</dt><dd>{metric.value < 0 ? <span className="agent-insight-unavailable">暂无数据</span> : <>{metric.value.toLocaleString('zh-CN')}<small>{metric.unit}</small></>}</dd>
        {metric.changePercent !== undefined && metric.value >= 0 && <span className={`agent-insight-change is-${metric.sentiment}`}>{metric.changePercent < 0 ? <ArrowDown size={11} /> : <ArrowUp size={11} />}{Math.abs(metric.changePercent)}%</span>}
      </div>)}</dl>
      <div className="agent-insight-blocks">{blocks.map(block => <InsightBlock key={block.id} block={block} />)}</div>
      <footer className="agent-insight-footer"><span>{insights?.scope === 'office' ? '本办公室' : '当前会话'}<time dateTime={insights?.updatedAt}>{insights && new Date(insights.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })} 更新</time></span>
        {period.blocks.length > blocks.length || expanded ? <button type="button" onClick={() => { interaction.pin(); setExpanded(!expanded) }}>{expanded ? '收起统计' : '完整统计'}{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button> : <span />}
      </footer>
    </> : <div className="agent-insight-empty"><strong>暂无历史统计</strong><p>{employee ? '该成员尚未提供统计数据' : '绑定业务成员后可展示统计'}</p></div>}
    </div>
  </div>, document.body)
})
