import { ArrowRight, Bell, X } from 'lucide-react'
import { decisionNoticeKey } from './model.ts'
import type { OfficeTeamOption } from './model.ts'
import { DecisionDeadline } from '../decisions/DecisionDeadline.tsx'

export function TeamDecisionNotice({ team, otherCount, onOpen, onDismiss }: {
  team: OfficeTeamOption; otherCount: number; onOpen: () => void; onDismiss: (key: string) => void
}) {
  const key = decisionNoticeKey(team)
  const request = team.pendingDecision
  return <div className="team-decision-notice" role="status" aria-label={`${team.name}待决定提示`}>
    <Bell size={16} aria-hidden="true" />
    <button type="button" className="team-decision-notice-body" aria-label={`前往处理${team.name}的确认请求`} onClick={onOpen}>
      <strong>{team.name}</strong><span>{team.decisionCount} 项待你决定{otherCount > 0 ? ` · 另有 ${otherCount} 个团队` : ''}</span>
    </button>
    <button type="button" className="team-decision-notice-open" title="前往处理" aria-label={`前往${team.name}`} onClick={onOpen}><ArrowRight size={16} /></button>
    <button type="button" className="team-decision-notice-dismiss" title="暂不提醒" aria-label={`暂不提醒${team.name}`} onClick={() => onDismiss(key)}><X size={14} /></button>
    {request?.expiresAt !== undefined && <DecisionDeadline className="team-decision-notice-deadline" label="问题剩余有效时间"
      expiresAt={request.expiresAt} createdAt={request.createdAt} deadline={request.deadline} />}
  </div>
}
