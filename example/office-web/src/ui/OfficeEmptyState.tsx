import { useEffect, useId, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { OfficeCreationForm } from './team-switcher/OfficeCreationForm.tsx'
import type { OfficeCreationInput } from '../dashboard/officeDirectory.ts'
import './team-switcher/TeamOverview.css'

export function OfficeEmptyState({ create, message = '暂无办公室' }: { create?: (input: OfficeCreationInput) => Promise<void>; message?: string }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const element = dialog.current
    element?.showModal()
    element?.querySelector('input')?.focus()
    return () => element?.close()
  }, [open])
  const close = () => { if (!busy) { setOpen(false); trigger.current?.focus() } }

  return <main className="office-main office-main-empty" aria-label="办公室空状态">
    {create ? <button ref={trigger} type="button" className="office-create-empty" onClick={() => setOpen(true)} aria-haspopup="dialog">
      <Plus size={36} strokeWidth={1.5} /><span>创建办公室</span>
    </button> : <p className="runtime-empty">{message}</p>}
    {open && create && <dialog ref={dialog} className="team-picker office-creation-dialog" aria-labelledby={id}
      onCancel={event => { event.preventDefault(); close() }}>
      <header className="team-picker-header"><h2 id={id}>创建办公室</h2><button type="button" className="team-picker-close" title="关闭" aria-label="关闭创建办公室" disabled={busy} onClick={close}><X size={19} /></button></header>
      <OfficeCreationForm create={create} onCancel={close} onCreated={() => setOpen(false)} onBusyChange={setBusy} />
    </dialog>}
  </main>
}
