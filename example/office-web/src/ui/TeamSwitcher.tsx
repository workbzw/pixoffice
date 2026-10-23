import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LayoutGrid } from 'lucide-react'
import { TeamOverviewDialog } from './team-switcher/TeamOverviewDialog.tsx'
import { TeamDecisionNotice } from './team-switcher/TeamDecisionNotice.tsx'
import { decisionNoticeKey, pendingDecisionTeams } from './team-switcher/model.ts'
import type { OfficeTeamSelection } from './team-switcher/model.ts'
import './team-switcher/TeamOverview.css'

export type { OfficeTeamOption, OfficeTeamSelection } from './team-switcher/model.ts'

export function TeamSwitcher({ selection, fallbackName = '办公室', onOpenChange, triggerTarget }: { selection?: OfficeTeamSelection; fallbackName?: string; onOpenChange?: (open: boolean) => void; triggerTarget?: HTMLElement | null }) {
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState<string[]>([])
  const dismiss = useCallback((key: string) => setDismissed(values => values.includes(key) ? values : [...values, key]), [])
  const trigger = useRef<HTMLButtonElement>(null)
  const listId = useId()
  const current = selection?.teams.find(team => team.id === selection.activeId)
  const canSwitch = (selection?.teams.length ?? 0) > 1 || !!selection?.create
  const pendingCount = selection?.teams.reduce((sum, team) => sum + (team.decisionCount ?? 0), 0) ?? 0
  const backgroundTeams = pendingDecisionTeams(selection)
  const notice = backgroundTeams.find(team => !dismissed.includes(decisionNoticeKey(team)))
  const focused = selection?.focusedDecisionTeamId === selection?.activeId && (current?.decisionCount ?? 0) > 0
  useEffect(() => {
    onOpenChange?.(open && canSwitch)
    return () => onOpenChange?.(false)
  }, [open, canSwitch, onOpenChange])

  const entry = <button ref={trigger} type="button" className="team-space-trigger" disabled={!canSwitch}
      title={`团队空间 · 当前团队：${current?.name ?? fallbackName}${pendingCount ? ` · ${pendingCount} 项待确认` : ''}`} aria-label={`团队空间，当前团队：${current?.name ?? fallbackName}${pendingCount ? `，${pendingCount} 项待确认` : ''}`}
      aria-expanded={canSwitch ? open : undefined} aria-controls={canSwitch && open ? listId : undefined} aria-haspopup={canSwitch ? 'dialog' : undefined}
      onClick={() => setOpen(value => !value)}>
      <LayoutGrid size={18} strokeWidth={1.7} />
      {pendingCount > 0 && <span className="team-decision-count" aria-hidden="true">{pendingCount > 99 ? '99+' : pendingCount}</span>}
    </button>
  return <div className="office-team-switcher">
    {triggerTarget ? createPortal(entry, triggerTarget) : entry}
    {!open && !focused && notice && <TeamDecisionNotice key={decisionNoticeKey(notice)} team={notice} otherCount={backgroundTeams.length - 1} onDismiss={dismiss}
      onResolve={selection?.resolveDecision ? (decisionId, choiceId) => selection.resolveDecision!(notice.id, decisionId, choiceId) : undefined}
      onOpen={() => { (selection?.openDecisions ?? selection?.select)?.(notice.id) }} />}
    {open && canSwitch && <TeamOverviewDialog id={listId} selection={selection!}
      onClose={() => { setOpen(false); trigger.current?.focus() }} />}
  </div>
}
