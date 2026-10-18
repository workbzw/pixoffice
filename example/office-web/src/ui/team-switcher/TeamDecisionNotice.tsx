import { useId, useState } from 'react'
import { ArrowUpRight, Bell, Check, LoaderCircle, X } from 'lucide-react'
import { decisionNoticeKey } from './model.ts'
import type { OfficeTeamOption } from './model.ts'
import { DecisionDeadline } from '../decisions/DecisionDeadline.tsx'

export function TeamDecisionNotice({ team, otherCount, onOpen, onDismiss, onResolve }: {
  team: OfficeTeamOption; otherCount: number; onOpen: () => void; onDismiss: (key: string) => void
  onResolve?: (decisionId: string, choiceId: string) => void
}) {
  const key = decisionNoticeKey(team)
  const request = team.pendingDecision
  const [selected, setSelected] = useState('')
  const groupId = useId()
  const descriptionId = useId()
  const busy = !!request && team.decisionSubmittingId === request.id
  const enabled = !!request && !!onResolve && !busy
  const openButton = <button type="button" className="team-decision-notice-open" title={`进入${team.name}办公室查看详情`} aria-label={`进入${team.name}办公室`} onClick={onOpen}><ArrowUpRight size={15} /></button>
  return <section className="team-decision-notice" role="region" aria-label={`${team.name}待决定提示`} aria-describedby={request?.description ? descriptionId : undefined} data-actionable={!!request && !!onResolve} aria-busy={busy}>
    <header>
      <Bell size={12} aria-hidden="true" /><strong title={team.name}>{team.name}</strong>
      <small className="team-decision-notice-meta" title={`${team.decisionCount} 项待你决定${otherCount > 0 ? `，另有 ${otherCount} 个团队` : ''}`}>{team.decisionCount} 待办{otherCount > 0 ? ` · +${otherCount}` : ''}</small>
      <button type="button" className="team-decision-notice-dismiss" title="暂不提醒" aria-label={`暂不提醒${team.name}`} onClick={() => onDismiss(key)}><X size={14} /></button>
    </header>
    {request && <form className="team-decision-notice-form" onSubmit={event => { event.preventDefault(); if (enabled && selected) onResolve?.(request.id, selected) }}>
      <div className="team-decision-notice-content">
        <h3 title={request.description ? `${request.title}\n${request.description}` : request.title}>{request.title}</h3>
        {request.description && <p id={descriptionId} className="team-decision-notice-description">{request.description}</p>}
        {request.kind === 'choice' && <fieldset aria-label="处理方案" disabled={!enabled}>
          {request.options.map(option => <label key={option.id} data-selected={selected === option.id} title={option.description || undefined}>
            <input type="radio" name={groupId} value={option.id} checked={selected === option.id} onChange={() => setSelected(option.id)} />
            <span><strong>{option.label}</strong>{option.description && <small className="team-decision-notice-option-detail">{option.description}</small>}</span>
          </label>)}
        </fieldset>}
      </div>
      {team.decisionError && <p className="team-decision-notice-error" role="alert">{team.decisionError}</p>}
      <footer>
        {openButton}
        {request.expiresAt !== undefined && <DecisionDeadline className="team-decision-notice-deadline" label="问题剩余有效时间"
          expiresAt={request.expiresAt} createdAt={request.createdAt} deadline={request.deadline} />}
        {request.kind === 'choice' ? <button type="submit" className="team-decision-notice-primary" disabled={!enabled || !selected}>
          {busy ? <LoaderCircle size={12} className="team-decision-notice-spinner" /> : selected ? <Check size={12} /> : undefined}{busy ? '正在提交…' : selected ? '提交选择' : '先选择一项'}
        </button> : <>
          <button type="button" className="team-decision-notice-secondary" disabled={!enabled} onClick={() => onResolve?.(request.id, 'reject')}><X size={12} />{request.rejectLabel}</button>
          <button type="button" className="team-decision-notice-primary" disabled={!enabled} onClick={() => onResolve?.(request.id, 'confirm')}>
            {busy ? <LoaderCircle size={12} className="team-decision-notice-spinner" /> : <Check size={12} />}{busy ? '正在提交…' : request.confirmLabel}
          </button>
        </>}
      </footer>
    </form>}
    {!request && openButton}
  </section>
}
