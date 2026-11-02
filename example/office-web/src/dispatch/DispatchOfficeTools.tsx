import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Bell, ChevronLeft, Plus } from 'lucide-react'
import type { OfficeWorkspaceToolsProps } from '../ui/OfficeWorkspaceTools.ts'
import type { OfficeTeamOption, OfficeTeamSelection } from '../ui/TeamSwitcher.tsx'
import { OfficeCreationForm } from '../ui/team-switcher/OfficeCreationForm.tsx'
import { animateOfficeEntry, animateOverview, applyOverviewFrame, fullOverviewFrame, overviewTriggerFrame, readOverviewOrigin, revealOffice } from './overviewTransition.ts'
import type { OverviewOrigin } from './overviewTransition.ts'
import { OfficeLivePreview } from './OfficeLivePreview.tsx'
import { OfficePreviewPool } from './OfficePreviewPool.ts'

const statuses = { unknown: '未同步', attention: '待处理', running: '运行中', completed: '已完成', idle: '空闲' } as const
const teamStatus = (team: OfficeTeamOption) => statuses[team.activity?.status ?? 'unknown']
type OfficeEntry = { id: string; name: string; origin: OverviewOrigin }
const previewViewport = () => typeof window === 'undefined' || window.innerWidth <= 760
  ? { width: 1440, height: 900 } : { width: window.innerWidth, height: window.innerHeight }

export function DispatchOverviewDialog({ id, selection, onClose, trigger, sceneReady = true, previewSessions, layoutId }: Pick<OfficeWorkspaceToolsProps, 'previewSessions' | 'layoutId'> & { id: string; selection: OfficeTeamSelection; onClose: () => void; trigger?: RefObject<HTMLButtonElement | null>; sceneReady?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const zoomSurface = useRef<HTMLDivElement>(null)
  const transition = useRef<Animation | undefined>(undefined)
  const closing = useRef(false)
  const revealing = useRef(false)
  const closed = useRef(onClose)
  const titleId = useId()
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [isClosing, setClosing] = useState(false)
  const [isOpening, setOpening] = useState(true)
  const [entry, setEntry] = useState<OfficeEntry>()
  const [entryExpanded, setEntryExpanded] = useState(false)
  const [previews] = useState(() => new OfficePreviewPool())
  const [viewport, setViewport] = useState(previewViewport)
  const teams = selection.teams
  const running = selection.teams.filter(team => team.activity?.running).length
  const pending = selection.teams.reduce((sum, team) => sum + (team.decisionCount ?? 0), 0)
  const close = () => {
    if (busy) return
    if (entry) { onClose(); return }
    if (closing.current) return
    const element = dialog.current
    if (!element) return
    if (!element.dataset.presented) { onClose(); return }
    closing.current = true
    setClosing(true)
    const current = getComputedStyle(element)
    const from = { transform: current.transform === 'none' ? fullOverviewFrame.transform : current.transform, borderRadius: current.borderRadius }
    applyOverviewFrame(element, from)
    transition.current?.cancel()
    const animation = animateOverview(element, from, overviewTriggerFrame(element, trigger?.current ?? null), true)
    transition.current = animation
    void animation.finished.then(onClose).catch(() => {})
  }

  const enter = (team: OfficeTeamOption, preview?: HTMLElement | null, decisions = false) => {
    if (busy || closing.current || isOpening || !preview) return
    const origin = readOverviewOrigin(preview, parseFloat(getComputedStyle(preview).borderTopLeftRadius))
    if (!origin) return
    closing.current = true
    setEntry({ id: team.id, name: team.name, origin })
    const select = decisions ? selection.openDecisions ?? selection.select : selection.select
    select(team.id)
  }

  useEffect(() => { closed.current = onClose }, [onClose])
  useEffect(() => {
    const resize = () => setViewport(previewViewport())
    window.addEventListener('resize', resize)
    return () => { window.removeEventListener('resize', resize); previews.stop() }
  }, [previews])

  useLayoutEffect(() => {
    const element = dialog.current
    if (!element) return
    let active = true, started = false
    const from = overviewTriggerFrame(element, trigger?.current ?? null)
    applyOverviewFrame(element, from)
    element.showModal()
    const start = () => {
      if (!active || started || closing.current) return
      started = true
      clearTimeout(timeout)
      const animation = animateOverview(element, from, fullOverviewFrame)
      transition.current = animation
      element.dataset.presented = 'true'
      element.querySelector<HTMLButtonElement>('.dispatch-icon-button')?.focus({ preventScroll: true })
      void animation.finished.then(() => {
        if (!active) return
        applyOverviewFrame(element, fullOverviewFrame)
        setOpening(false)
      }).catch(() => {})
    }
    const timeout = setTimeout(start, 0)
    return () => {
      active = false
      clearTimeout(timeout)
      delete element.dataset.presented
      transition.current?.cancel()
      element.close()
    }
  }, [trigger])

  useLayoutEffect(() => {
    if (!entry || !zoomSurface.current) return
    const animation = animateOfficeEntry(zoomSurface.current, entry.origin)
    void animation.finished.then(() => setEntryExpanded(true)).catch(() => {})
    return () => animation.cancel()
  }, [entry])

  useEffect(() => {
    if (!entryExpanded || !entry || !sceneReady || selection.activeId !== entry.id || !dialog.current || revealing.current) return
    revealing.current = true
    const animation = revealOffice(dialog.current)
    transition.current = animation
    void animation.finished.then(() => closed.current()).catch(() => {})
  }, [entryExpanded, entry, sceneReady, selection.activeId])

  useEffect(() => {
    if (!entry) return
    const timeout = setTimeout(() => closed.current(), 10000)
    return () => clearTimeout(timeout)
  }, [entry])

  return <dialog ref={dialog} id={id} className="dispatch-overview" aria-labelledby={titleId} aria-busy={busy || isClosing || !!entry}
    onCancel={event => { event.preventDefault(); close() }} onClose={event => { if (!event.currentTarget.open) onClose() }}
    onClick={event => {
      if (event.target !== event.currentTarget) return
      const rect = event.currentTarget.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close()
    }}>
    <h2 id={titleId} className="dispatch-visually-hidden">{creating ? '新建办公室' : '办公室总览'}</h2>
    <header className="dispatch-overview-heading">
      <button type="button" className="dispatch-icon-button" title="返回办公室" aria-label="关闭办公室总览" disabled={busy || isClosing || !!entry} onClick={() => close()}><ChevronLeft size={22} /></button>
      <span className="dispatch-office-count">{creating ? '新建办公室' : `${selection.teams.length} 个办公室`}</span>
      <button type="button" className="dispatch-overview-ring" data-running={running > 0 || undefined} disabled={busy || isClosing || !!entry}
        title={`${running}/${teams.length} 个办公室运行中${pending ? ` · ${pending} 项待确认` : ''} · 返回办公室`} aria-label="返回当前办公室" onClick={() => close()}><span data-wide={`${running}/${teams.length}`.length > 5 || undefined}>{`${running}/${teams.length}`}</span>{pending > 0 && <i className="dispatch-attention-dot" aria-hidden="true" />}</button>
    </header>
    {creating && selection.create ? <OfficeCreationForm create={selection.create} onCancel={() => setCreating(false)} onCreated={onClose} onBusyChange={setBusy} />
      : <div className="dispatch-overview-scroll" inert={isOpening || isClosing || !!entry}><div className="dispatch-office-grid">
        {teams.map(team => <article className="dispatch-office-card" key={team.id} data-running={team.activity?.running || undefined}
          data-current={team.id === selection.activeId || undefined} data-status={team.activity?.status ?? 'unknown'}>
          <div role="button" tabIndex={0} className="dispatch-card-enter" aria-label={`进入${team.name}`} aria-pressed={team.id === selection.activeId}
            title={[team.name, teamStatus(team), team.activity?.goal, team.activity?.latestActivity].filter(Boolean).join('\n')}
            onClick={event => enter(team, event.currentTarget.querySelector<HTMLElement>('.dispatch-preview'))}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); enter(team, event.currentTarget.querySelector<HTMLElement>('.dispatch-preview')) } }}>
            <div className="dispatch-preview">{previewSessions?.get(team.id)
              ? <OfficeLivePreview session={previewSessions.get(team.id)!} pool={previews} layoutId={layoutId} viewport={viewport} />
              : <span className="dispatch-preview-loading">预览未就绪</span>}</div>
            <span className="dispatch-card-caption"><span className="dispatch-card-name">{team.activity?.status !== 'idle' && <span className="dispatch-status">{teamStatus(team)}</span>}<strong>{team.name}</strong></span>
              {team.id === selection.activeId && !team.decisionCount && <span className="dispatch-current-label">当前办公室</span>}</span>
          </div>
          {!!team.decisionCount && <button type="button" className="dispatch-card-attention" aria-label={`${team.name}，${team.decisionCount} 项待确认`}
            title={`${team.decisionCount} 项待确认`} onClick={event => enter(team, event.currentTarget.closest('.dispatch-office-card')?.querySelector<HTMLElement>('.dispatch-preview'), true)}><Bell size={13} /><span>{team.decisionCount}</span></button>}
        </article>)}
        {selection.create && <button type="button" className="dispatch-office-create" aria-label="新建办公室" title="新建办公室" onClick={() => setCreating(true)}><Plus size={46} strokeWidth={1.7} /></button>}
      </div>{!teams.length && !selection.create && <p className="dispatch-empty">暂无办公室</p>}</div>}
    {entry && <div ref={zoomSurface} className="dispatch-office-zoom" aria-hidden="true">{previewSessions?.get(entry.id) && <OfficeLivePreview session={previewSessions.get(entry.id)!} pool={previews} layoutId={layoutId} viewport={viewport} />}</div>}
    {entry && entryExpanded && !sceneReady && <p className="dispatch-entry-status" role="status">正在进入{entry.name}…</p>}
  </dialog>
}

export function DispatchOfficeTools({ teamSelection, onOpenChange, sceneReady, previewSessions, layoutId }: OfficeWorkspaceToolsProps) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const previousOpen = useRef(false)
  const id = useId()
  const teams = teamSelection?.teams ?? []
  const running = teams.filter(team => team.activity?.running).length
  const current = teams.find(team => team.id === teamSelection?.activeId)
  const pending = teams.reduce((sum, team) => sum + (team.decisionCount ?? 0), 0)
  useEffect(() => {
    onOpenChange(open)
    if (previousOpen.current && !open) trigger.current?.focus()
    previousOpen.current = open
    return () => onOpenChange(false)
  }, [open, onOpenChange])
  const label = `办公室总览，${running} 个运行中，共 ${teams.length} 个办公室${pending ? `，${pending} 项待确认` : ''}`
  return <>
    {current?.activity?.running && <div className="dispatch-running-frame" aria-hidden="true" />}
    <button ref={trigger} className="dispatch-ring-button" type="button" data-running={running > 0 || undefined}
      aria-label={label} title={label} aria-expanded={open} aria-controls={open ? id : undefined} aria-haspopup="dialog" disabled={!teamSelection}
      onClick={() => setOpen(true)}><span aria-hidden="true" data-wide={`${running}/${teams.length}`.length > 5 || undefined}>{`${running}/${teams.length}`}</span>{pending > 0 && <i className="dispatch-attention-dot" aria-hidden="true" />}</button>
    {open && teamSelection && <DispatchOverviewDialog previewSessions={previewSessions} layoutId={layoutId} id={id} selection={teamSelection} trigger={trigger} sceneReady={sceneReady} onClose={() => setOpen(false)} />}
  </>
}
