import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { OfficeCreationForm } from './OfficeCreationForm.tsx'
import { TeamAvatars, TeamEnter, TeamStats, TeamThumbnail } from './TeamVisual.tsx'
import { filterTeams, teamAccent } from './model.ts'
import type { OfficeTeamSelection } from './model.ts'

export function TeamOverviewDialog({ id, selection, onClose }: {
  id: string; selection: OfficeTeamSelection; onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const titleId = useId()
  const [query, setQuery] = useState('')
  const [closing, setClosing] = useState(false)
  const [switchingId, setSwitchingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const teams = filterTeams(selection.teams, query)
  const active = selection.teams.find(team => team.id === selection.activeId)

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => { clearTimeout(closeTimer.current); dialog?.close() }
  }, [])

  const finish = () => {
    setClosing(true)
    closeTimer.current = setTimeout(() => dialogRef.current?.close(), 180)
  }
  const close = () => { if (!closing && !busy) finish() }
  const choose = (teamId: string) => {
    if (closing) return
    if (teamId !== selection.activeId) setSwitchingId(teamId)
    if ((selection.teams.find(team => team.id === teamId)?.decisionCount ?? 0) > 0 && selection.openDecisions) selection.openDecisions(teamId)
    else if (teamId !== selection.activeId) selection.select(teamId)
    close()
  }

  return <dialog id={id} ref={dialogRef} aria-labelledby={titleId}
    className={`team-picker${creating ? ' office-creation-dialog' : ''}${closing ? ' is-closing' : ''}`}
    onClose={event => { if (!event.currentTarget.open) onClose() }}
    onCancel={event => { event.preventDefault(); close() }}
    onClick={event => {
      if (event.target !== event.currentTarget) return
      const rect = event.currentTarget.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close()
    }}>
    <header className="team-picker-header">
      <div className="team-picker-heading"><span className="team-picker-eyebrow">PixOffice / {String(selection.teams.length).padStart(2, '0')} SPACES</span>
        <div className="team-picker-title"><h2 id={titleId}>{creating ? '创建办公室' : '团队空间'}</h2>
          {!creating && selection.create && <button type="button" className="team-picker-create" title="新建办公室" aria-label="新建办公室" onClick={() => setCreating(true)}><Plus size={19} strokeWidth={1.8} /></button>}
        </div>
      </div>
      {!creating && <label className="team-picker-search"><Search size={16} /><input aria-label="搜索团队" placeholder="搜索团队" value={query} onChange={event => setQuery(event.target.value)} /></label>}
      <button className="team-picker-close" type="button" aria-label="关闭团队切换" title="关闭团队切换" disabled={busy} onClick={close}><X size={19} /></button>
    </header>
    {creating && selection.create ? <OfficeCreationForm create={selection.create} onCancel={() => setCreating(false)} onCreated={finish} onBusyChange={setBusy} /> : <>
    {!teams.length && <div className="team-picker-empty">没有匹配的团队</div>}
    <div className="team-overview-grid">
      {teams.map((team, index) => {
        const teamIndex = Math.max(0, selection.teams.findIndex(item => item.id === team.id))
        return <button key={team.id} type="button" aria-label={`进入${team.name}`} aria-pressed={team.id === selection.activeId}
          className={`team-space-card${switchingId === team.id ? ' is-selected' : ''}`}
          style={{ ...teamAccent(teamIndex), '--item-index': index } as CSSProperties} onClick={() => choose(team.id)}>
          <TeamThumbnail team={team} /><span className="team-space-info"><span className="team-space-number">SPACE {String(teamIndex + 1).padStart(2, '0')}</span><strong>{team.name}</strong>
            {team.description && <span className="team-space-description">{team.description}</span>}<TeamStats team={team} />
            <span className="team-space-bottom"><TeamAvatars team={team} /><TeamEnter current={team.id === selection.activeId} /></span>
          </span>
        </button>
      })}
      {selection.create && <button type="button" className="team-space-card team-space-create" aria-label="新建办公室" onClick={() => setCreating(true)}>
        <Plus size={42} strokeWidth={1.4} /><strong>新建办公室</strong>
      </button>}
    </div>
    <footer className="team-picker-footer"><span><i />{active?.name ?? '当前团队'}</span><span>{selection.teams.length} 个团队空间</span></footer>
    </>}
  </dialog>
}
