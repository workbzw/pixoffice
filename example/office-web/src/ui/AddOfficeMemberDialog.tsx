import { useEffect, useId, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { officeMemberInputSchema } from '@pixoffice/protocol/dashboard'
import type { OfficeMemberInput } from '@pixoffice/protocol/dashboard'
import { CharacterAvatar } from '../components/CharacterArtwork.tsx'
import './AddOfficeMemberDialog.css'

export function AddOfficeMemberDialog({ actors, appearanceIds, create, onClose }: {
  actors: readonly { id: string; name: string }[]
  appearanceIds: Readonly<Record<string, string>>
  create: (input: OfficeMemberInput) => Promise<void>
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const mounted = useRef(false)
  const flight = useRef(false)
  const titleId = useId()
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [actorId, setActorId] = useState(actors[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    mounted.current = true
    const element = dialog.current
    const previousFocus = document.activeElement
    element?.showModal()
    nameInput.current?.focus()
    return () => { mounted.current = false; element?.close(); if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus() }
  }, [])

  return <dialog ref={dialog} className="office-member-dialog" aria-labelledby={titleId} onCancel={event => { if (flight.current) event.preventDefault(); else onClose() }}>
    <header><h2 id={titleId}>添加成员</h2><button type="button" title="关闭" aria-label="关闭添加成员" disabled={busy} onClick={onClose}><X size={18} /></button></header>
    <form onSubmit={event => {
      event.preventDefault()
      if (flight.current) return
      const parsed = officeMemberInputSchema.safeParse({ name, role, sceneActorId: actorId })
      if (!parsed.success) { setError('请填写姓名，并选择空闲工位'); return }
      flight.current = true; setBusy(true); setError('')
      void create(parsed.data).then(() => { if (mounted.current) onClose() }).catch(cause => {
        if (mounted.current) setError(cause instanceof Error ? cause.message : '添加成员失败')
      }).finally(() => { flight.current = false; if (mounted.current) setBusy(false) })
    }}>
      <fieldset disabled={busy}>
        <label>姓名<input ref={nameInput} name="memberName" aria-label="成员姓名" value={name} maxLength={80} required autoComplete="off" onChange={event => setName(event.target.value)} /></label>
        <label>职责<input name="memberRole" aria-label="成员职责" value={role} maxLength={80} autoComplete="off" onChange={event => setRole(event.target.value)} /></label>
        <div className="office-member-actors" role="radiogroup" aria-label="空闲工位">
          <span>空闲工位</span>
          <div>{actors.map(actor => <label className="office-member-actor" key={actor.id}>
            <input type="radio" name="memberActor" value={actor.id} aria-label={`选择${actor.name}的工位`} checked={actorId === actor.id} onChange={() => setActorId(actor.id)} />
            <span><CharacterAvatar appearanceId={appearanceIds[actor.id]} height={36} crop="head" /><strong>{actor.name}</strong></span>
          </label>)}</div>
        </div>
      </fieldset>
      {error && <p className="office-member-error" role="alert">{error}</p>}
      <footer><button type="button" disabled={busy} onClick={onClose}>取消</button><button type="submit" className="office-member-submit" disabled={busy || !name.trim() || !actors.some(actor => actor.id === actorId)}><Plus size={15} />{busy ? '正在添加…' : '添加成员'}</button></footer>
    </form>
  </dialog>
}
