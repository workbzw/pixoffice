import { useEffect, useId, useRef, useState } from 'react'
import { ArrowLeft, LoaderCircle, Plus } from 'lucide-react'
import type { OfficeCreationInput } from '../../dashboard/officeDirectory.ts'

export type OfficeCreationFormProps = {
  create: (input: OfficeCreationInput) => Promise<void>
  onCancel: () => void
  onCreated: () => void
  onBusyChange?: (busy: boolean) => void
}

export function OfficeCreationForm({ create, onCancel, onCreated, onBusyChange }: OfficeCreationFormProps) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const submitting = useRef(false)
  const id = useId()
  useEffect(() => { input.current?.focus() }, [])

  return <form className="office-creation-form" aria-label="创建办公室" aria-busy={busy} onSubmit={async event => {
    event.preventDefault()
    if (submitting.current) return
    if (!name.trim()) { setError('请输入办公室名称'); input.current?.focus(); return }
    submitting.current = true; setBusy(true); setError(null); onBusyChange?.(true)
    try { await create({ name: name.trim() }); onCreated() }
    catch (cause) { setError(cause instanceof Error ? cause.message : '创建失败，请重试') }
    finally { submitting.current = false; setBusy(false); onBusyChange?.(false) }
  }}>
    <label htmlFor={id}>办公室名称</label>
    <input ref={input} id={id} name="officeName" value={name} maxLength={40} required disabled={busy}
      autoComplete="off" placeholder="例如：产品研发团队" aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
      onChange={event => { setName(event.target.value); setError(null) }} />
    <div className="office-creation-configuration">
      <img src={`${import.meta.env.BASE_URL}site/office-scene.webp`} alt="标准办公室布局" />
      <dl><div><dt>布局</dt><dd>标准办公室</dd></div><div><dt>工位</dt><dd>6 个</dd></div><div><dt>人物</dt><dd>固定外观</dd></div></dl>
    </div>
    {error && <p id={`${id}-error`} className="office-creation-error" role="alert">{error}</p>}
    <div className="office-creation-actions">
      <button type="button" className="office-creation-cancel" disabled={busy} onClick={onCancel}><ArrowLeft size={16} />返回</button>
      <button type="submit" className="office-creation-submit" disabled={busy || !name.trim()}>
        {busy ? <LoaderCircle className="office-creation-spinner" size={17} /> : <Plus size={17} />}{busy ? '创建中…' : '创建办公室'}
      </button>
    </div>
  </form>
}
