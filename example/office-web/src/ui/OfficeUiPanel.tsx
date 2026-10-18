import { useEffect, useRef, useSyncExternalStore } from 'react'
import { X } from 'lucide-react'
import type { OfficeUiSession } from '../application/OfficeUiSession.ts'
import './OfficeUiPanel.css'

export function OfficeUiPanel({ session }: { session: OfficeUiSession }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const dialog = useRef<HTMLDialogElement>(null)
  const open = Boolean(state.dialog)
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close() }, [open])
  if (!session.enabled) return null
  return <>
    {(state.pending || state.error) && <div className="office-ui-status" role={state.error ? 'alert' : 'status'}>{state.error ?? '等待后端处理…'}{state.error && <button type="button" title="关闭提示" aria-label="关闭操作提示" onClick={session.close}><X size={16} /></button>}</div>}
    <dialog className="office-ui-dialog" ref={dialog} aria-labelledby={`office-ui-title-${session.teamId}`} onCancel={session.close}>
      {state.dialog && <><header><h2 id={`office-ui-title-${session.teamId}`}>{state.dialog.title}</h2><button type="button" title="关闭详情" aria-label="关闭详情" onClick={session.close}><X size={18} /></button></header>
        {state.dialog.description && <p>{state.dialog.description}</p>}
        <dl>{state.dialog.fields.map((field, index) => <div key={index}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>
        {!!state.dialog.actions.length && <footer>{state.dialog.actions.map(option => <button type="button" key={option.id} disabled={state.pending} onClick={() => { void session.request({ action: 'dialog.action', interactionId: state.interactionId!, optionId: option.id }).catch(() => {}) }}>{option.label}</button>)}</footer>}
      </>}
    </dialog>
  </>
}
