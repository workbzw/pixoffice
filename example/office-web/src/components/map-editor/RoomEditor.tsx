import { useRef, useState } from 'react'
import { Armchair, Archive, Check, ChevronDown, Copy, Download, Grid2X2, House, MoreHorizontal, MousePointer2, Redo2, Route, Undo2, Upload, X } from 'lucide-react'
import { mapDocumentSchema } from '@pixoffice/runtime/map/schema'
import { FURNITURE_CELL_SIZE, furnitureFootprint, snapFurniture } from '@pixoffice/runtime/map/furnitureGrid'
import { downloadMap, editMap } from './commands.ts'
import type { EditorProps, MapAction, MapFurniture } from './commands.ts'
import './MapEditor.css'

type Props = EditorProps & { thumbnails: Record<string, string> }

export function RoomEditor(props: Props) {
  const { runtime, draft, view, setView, thumbnails, onError } = props
  const [tab, setTab] = useState<'catalog' | 'placed'>('catalog')
  const [advanced, setAdvanced] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const exit = useRef<HTMLDialogElement>(null)
  const selected = draft.document.props.find(p => p.id === view.selection)
  const template = selected ? runtime.template(selected.templateId) : undefined
  const binding = draft.document.bindings.find(b => b.homeId === selected?.id)
  const run = (action: MapAction) => {
    try { editMap(runtime, action); onError(null); return true }
    catch (error) { onError(error instanceof Error ? error.message.slice(0, 500) : '布置失败'); return false }
  }
  const place = (item: Pick<MapFurniture, 'templateId' | 'name' | 'anchors'>) => {
    setView(v => ({ ...v, tool: 'select', selection: '', placing: { ...item, id: `prop-${crypto.randomUUID()}`, position: snapFurniture({ x: 14, y: 6 }) } }))
    onError(null)
  }
  const end = () => { if (draft.canUndo) exit.current?.showModal(); else run({ action: 'cancel' }) }
  const thumb = (id: string, name: string) => thumbnails[id] ? <img src={thumbnails[id]} alt={name} draggable={false} /> : <Armchair size={28} />
  const dimensions = (id: string) => {
    const b = furnitureFootprint(runtime.template(id))
    return `${(b.right - b.left) / FURNITURE_CELL_SIZE} × ${(b.bottom - b.top) / FURNITURE_CELL_SIZE}`
  }

  return <>
    <header className="room-header">
      <div className="room-heading"><span className="room-heading-icon"><House size={22} /></span><div><h1>布置办公室</h1><span>{draft.document.props.length} 件家具</span></div></div>
      <div className="room-history" role="toolbar" aria-label="布置历史">
        <button title="撤销" aria-label="撤销" disabled={!draft.canUndo} onClick={() => run({ action: 'undo' })}><Undo2 size={19} /></button>
        <button title="重做" aria-label="重做" disabled={!draft.canRedo} onClick={() => run({ action: 'redo' })}><Redo2 size={19} /></button>
      </div>
      <div className="room-finish">
        <button className="room-icon" title="高级选项" aria-label="高级选项" aria-expanded={advanced} onClick={() => setAdvanced(v => !v)}><MoreHorizontal size={22} /></button>
        <button className="room-icon" title="退出布置" aria-label="退出布置" onClick={end}><X size={20} /></button>
        <button className="room-done" disabled={!draft.validation.valid || Boolean(view.placing)} onClick={() => run({ action: 'commit' })}><Check size={18} />完成布置</button>
      </div>
    </header>

    {advanced && <section className="room-advanced" aria-label="高级选项">
      <button onClick={() => { setView(v => ({ ...v, tool: v.tool === 'route' ? 'select' : 'route', placing: undefined, selection: '' })); setAdvanced(false) }}><Route size={17} />路线测试</button>
      <button onClick={() => file.current?.click()}><Upload size={17} />导入布局</button>
      <button onClick={() => downloadMap(runtime)}><Download size={17} />导出布局</button>
      <small>布局 {draft.baseLayoutRevision} · 草稿 {draft.revision}</small>
    </section>}
    <input ref={file} type="file" accept=".json,application/json" hidden onChange={async e => {
      const selected = e.currentTarget.files?.[0]; e.currentTarget.value = ''
      if (!selected) return
      const reference = runtime.editorSnapshot()
      try {
        if (selected.size > 65536) throw new Error('地图文件不能超过 64 KB')
        const document = mapDocumentSchema.parse(JSON.parse(await selected.text()))
        editMap(runtime, { action: 'patch', operations: [{ op: 'map.replace', document }] }, reference)
        setView(v => ({ ...v, selection: '', placing: undefined })); setAdvanced(false); onError(null)
      } catch (error) { onError(error instanceof Error ? error.message.slice(0, 500) : '导入失败') }
    }} />

    {selected && template && !view.placing && view.tool === 'select' && <section className="room-selection" aria-label="选中家具">
      <div className="room-selection-thumb">{thumb(template.id, template.name)}</div>
      <div className="room-selection-info">
        <input key={`${selected.id}:${selected.name}`} aria-label="家具名称" defaultValue={selected.name} maxLength={100} onBlur={e => {
          const name = e.currentTarget.value.trim(); e.currentTarget.value = selected.name
          if (name && name !== selected.name) run({ action: 'patch', operations: [{ op: 'prop.put', prop: { ...selected, name } }], requireValid: true })
        }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
        {template.interactions?.seat ? <select aria-label="工位所属人物" value={binding?.actorId ?? ''} onChange={e => {
          const actorId = e.target.value
          const oldHome = draft.document.bindings.find(b => b.actorId === actorId)?.homeId ?? null
          run({ action: 'patch', requireValid: true, operations: [
            ...(binding ? [{ op: 'binding.set' as const, actorId: binding.actorId, homeId: oldHome, position: { x: selected.position.x - 1, y: selected.position.y + 1 } }] : []),
            ...(actorId ? [{ op: 'binding.set' as const, actorId, homeId: selected.id }] : []),
          ] })
        }}><option value="">空闲工位</option>{runtime.readActors().map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select> : <span>{template.name}</span>}
      </div>
      <button className="room-icon" title="复制家具" aria-label="复制家具" onClick={() => place({ templateId: selected.templateId, name: template.name, anchors: selected.anchors })}><Copy size={18} /></button>
      <button className="room-icon" title={binding ? '请先将人物调到其他工位' : '收起家具'} aria-label="收起家具" disabled={Boolean(binding)} onClick={() => {
        if (run({ action: 'patch', operations: [{ op: 'prop.remove', id: selected.id }], requireValid: true })) setView(v => ({ ...v, selection: '' }))
      }}><Archive size={18} /></button>
      <button className="room-icon" title="取消选择" aria-label="取消选择" onClick={() => setView(v => ({ ...v, selection: '' }))}><X size={17} /></button>
    </section>}

    {view.placing && <div className="room-placement-label"><Armchair size={17} /><strong>{view.placing.name}</strong><button className="room-icon" title="取消摆放" aria-label="取消摆放" onClick={() => setView(v => ({ ...v, placing: undefined }))}><X size={17} /></button></div>}
    {view.tool === 'route' && <div className="room-placement-label"><Route size={17} /><strong>路线测试</strong><button className="room-icon" title="结束路线测试" aria-label="结束路线测试" onClick={() => setView(v => ({ ...v, tool: 'select' }))}><X size={17} /></button></div>}
    {!draft.validation.valid && <div className="room-validation" role="status">{draft.validation.error?.message ?? '布局待调整'}</div>}

    <section className={`room-catalog ${view.catalogOpen ? '' : 'collapsed'}`} aria-label="家具目录">
      <div className="room-catalog-head">
        <div className="room-catalog-tabs" role="tablist" aria-label="家具分类">
          <button role="tab" aria-selected={tab === 'catalog'} onClick={() => { setTab('catalog'); setView(v => ({ ...v, catalogOpen: true })) }}><Armchair size={17} />家具</button>
          <button role="tab" aria-selected={tab === 'placed'} onClick={() => { setTab('placed'); setView(v => ({ ...v, catalogOpen: true })) }}><Grid2X2 size={17} />房间内<span>{draft.document.props.length}</span></button>
        </div>
        <button className="room-icon" title={view.catalogOpen ? '收起家具目录' : '展开家具目录'} aria-label={view.catalogOpen ? '收起家具目录' : '展开家具目录'} aria-expanded={view.catalogOpen} onClick={() => setView(v => ({ ...v, catalogOpen: !v.catalogOpen }))}><ChevronDown size={19} /></button>
      </div>
      {view.catalogOpen && <div className="room-catalog-items" role="tabpanel" aria-label={tab === 'catalog' ? '家具' : '房间内'}>
        {tab === 'catalog' ? runtime.templates().map(t => <button key={t.id} className="room-furniture" aria-label={`摆放${t.name}`} aria-pressed={view.placing?.templateId === t.id} onClick={() => place({ templateId: t.id, name: t.name })}>
          <div className="room-furniture-image">{thumb(t.id, t.name)}</div><strong>{t.name} <small>{dimensions(t.id)}</small></strong>
        </button>) : draft.document.props.map(p => <button key={p.id} className="room-furniture" aria-label={`选择${p.name}`} aria-pressed={view.selection === p.id} onClick={() => { setView(v => ({ ...v, tool: 'select', selection: p.id, placing: undefined })); onError(null) }}>
          <div className="room-furniture-image">{thumb(p.templateId, p.name)}</div><strong>{p.name}</strong>
        </button>)}
      </div>}
    </section>
    <div className="room-mode-mark"><MousePointer2 size={15} /><span>布置模式</span></div>
    <dialog ref={exit} className="room-exit-dialog"><h2>放弃本次布置？</h2><p>办公室将恢复到进入布置前的布局。</p><div><button onClick={() => exit.current?.close()}>继续布置</button><button className="room-discard" onClick={() => run({ action: 'cancel' })}>放弃修改</button></div></dialog>
  </>
}
