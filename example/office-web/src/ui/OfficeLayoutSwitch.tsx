import { useEffect, useRef, useState } from 'react'
import { Check, Columns3, PanelLeft, PanelsTopLeft } from 'lucide-react'
import type { OfficeLayoutId } from '@pixoffice/protocol/office-integration'
import './OfficeLayoutSwitch.css'

export function OfficeLayoutSwitch({ value, onChange, disabled = false }: { value: OfficeLayoutId; onChange: (value: OfficeLayoutId) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape) }
  }, [open])
  return <div className="office-layout-switch" ref={root}>
    <button ref={trigger} type="button" className="office-layout-trigger" title="切换页面布局" aria-label="切换页面布局" disabled={disabled} aria-expanded={open} onClick={() => setOpen(value => !value)}><PanelsTopLeft size={18} /></button>
    {open && <div className="office-layout-options" role="group" aria-label="页面布局">
      {([{ id: 'classic', label: '经典布局', icon: Columns3 }, { id: 'members', label: '成员布局', icon: PanelLeft }] as const).map(option => <button type="button" key={option.id} disabled={disabled} aria-pressed={value === option.id}
        onClick={() => { onChange(option.id); setOpen(false) }}><option.icon size={16} /><span>{option.label}</span>{value === option.id && <Check size={15} />}</button>)}
    </div>}
  </div>
}
