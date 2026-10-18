import './components.css'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Check, CircleAlert, X } from 'lucide-react'
import { assetUrl, statusLabel } from '../data.ts'
import type { Task, Worker } from '../data.ts'

export function Avatar({ worker, large = false }: { worker: Worker; large?: boolean }) {
  const x = worker.sprite % 3 * 512, y = Math.floor(worker.sprite / 3) * 512
  return <span className={`studio-avatar${large ? ' studio-avatar-large' : ''}`} aria-hidden="true">
    <img src={assetUrl('portraits')} alt="" style={{ width: '300%', left: `${-x / 512 * 100}%`, top: `${-y / 512 * 100}%` }} />
  </span>
}
export function Meter({ value, warning = false }: { value: number; warning?: boolean }) {
  return <span className={`studio-meter${warning ? ' is-warning' : ''}`} role="progressbar" aria-label="任务进度" aria-valuenow={Math.floor(value)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${value}%` }} /></span>
}
export function TaskState({ task }: { task: Task }) {
  return <span className={`studio-state is-${task.status}`}>{task.status === 'done' ? <Check size={13} /> : task.status === 'blocked' ? <CircleAlert size={13} /> : <span className="studio-dot" />}{statusLabel(task.status)}</span>
}
export function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => { dialog.close() } }, [])
  return <dialog ref={ref} className="studio-dialog" aria-label={title} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="studio-dialog-head"><h2>{title}</h2><button className="studio-icon-button" title="关闭" aria-label="关闭" onClick={onClose}><X size={20} /></button></div>
    <div className="studio-dialog-content">{children}</div>
  </dialog>
}
