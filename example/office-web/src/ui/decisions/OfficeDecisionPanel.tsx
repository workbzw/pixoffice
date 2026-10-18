import { useEffect, useId, useState } from 'react'
import { ArrowRight, Check, ChevronDown, CircleHelp, RotateCcw, X } from 'lucide-react'
import { CharacterAvatar } from '../../components/CharacterArtwork.tsx'
import type { DecisionRequest, DecisionSnapshot } from '../../application/decisions/DecisionSession.ts'
import { DecisionDeadline } from './DecisionDeadline.tsx'
import './OfficeDecisionPanel.css'

export function OfficeDecisionPanel({ snapshot, onResolve, onShowRecords, onReset, preview = false, hidden = false, openToken = 0 }: {
  snapshot: DecisionSnapshot
  onResolve: (decisionId: string, choiceId: string) => void
  onShowRecords: () => void
  onReset: () => void
  preview?: boolean
  hidden?: boolean
  openToken?: number
}) {
  const [collapsed, setCollapsed] = useState(false)
  const current = snapshot.pending[0]
  const last = snapshot.receipt
  const requestKey = current ? `${current.id}:${current.createdAt ?? ''}:${current.deadline ?? ''}` : ''
  useEffect(() => { setCollapsed(false) }, [openToken, requestKey])
  if (!current && !last) return null
  return <aside className="office-decision" aria-label="待你决定" hidden={hidden}>
    {current && !collapsed ? <DecisionCard key={`${current.id}:${current.createdAt ?? ''}:${current.deadline ?? ''}`} request={current} count={snapshot.pending.length} preview={preview}
      busy={snapshot.submittingId === current.id} error={snapshot.error}
      onResolve={choiceId => onResolve(current.id, choiceId)} onCollapse={() => setCollapsed(true)} />
      : current ? <button type="button" className="office-decision-pending" onClick={() => setCollapsed(false)}>
        <CircleHelp size={17} /><strong>待你决定</strong><span>{snapshot.pending.length}</span><span className="office-decision-pending-title">{current.title}</span><ArrowRight size={15} />
      </button> : <div className="office-decision-receipt" role="status">
        <Check size={16} /><span>已记录：{last!.label}</span>
        <button type="button" onClick={onShowRecords}>查看记录<ArrowRight size={13} /></button>
        {preview && <button type="button" className="office-decision-replay" title="重新演示" aria-label="重新演示" onClick={() => { setCollapsed(false); onReset() }}><RotateCcw size={15} /></button>}
      </div>}
  </aside>
}

export function DecisionCard({ request, count, onResolve, onCollapse, preview = false, busy = false, error }: {
  request: DecisionRequest; count: number; onResolve: (choiceId: string) => void; onCollapse: () => void; preview?: boolean; busy?: boolean; error?: string | null
}) {
  const [selected, setSelected] = useState('')
  const titleId = useId()
  const groupId = useId()
  return <section className="office-decision-card" aria-labelledby={titleId}>
    <header className="office-decision-header">
      <CharacterAvatar appearanceId={request.requester.appearanceId} />
      <div><strong>{request.requester.name}</strong><span>请求你的决定</span></div>
      <small role="status">{preview && '本地演示 · '}{count} 项待处理</small>
      <button type="button" title="稍后处理" aria-label="收起待决定面板" onClick={onCollapse}><ChevronDown size={18} /></button>
    </header>
    <h3 id={titleId}>{request.title}</h3>
    <p className="office-decision-description">{request.description}</p>
    {error && <p className="office-decision-error" role="alert">{error}</p>}
    {request.kind === 'choice' && <fieldset className="office-decision-options" aria-label="处理方案" disabled={busy}>
      {request.options.map(option => <label key={option.id} data-selected={selected === option.id}>
        <input type="radio" name={groupId} value={option.id} checked={selected === option.id} onChange={() => setSelected(option.id)} />
        <span><strong>{option.label}</strong><small>{option.description}</small></span>
      </label>)}
    </fieldset>}
    <footer className="office-decision-actions">
      <span>{busy ? '正在提交…' : count > 1 ? `另有 ${count - 1} 项待处理` : '最后一项'}</span>
      {request.kind === 'choice' ? <button type="button" className="office-decision-primary" disabled={busy || !selected} onClick={() => onResolve(selected)}><Check size={15} />提交选择</button>
        : <><button type="button" className="office-decision-secondary" disabled={busy} onClick={() => onResolve('reject')}><X size={15} />{request.rejectLabel}</button>
          <button type="button" className="office-decision-primary" disabled={busy} onClick={() => onResolve('confirm')}><Check size={15} />{request.confirmLabel}</button></>}
    </footer>
    {request.expiresAt !== undefined && <DecisionDeadline className="office-decision-deadline" expiresAt={request.expiresAt} createdAt={request.createdAt} deadline={request.deadline} />}
  </section>
}
