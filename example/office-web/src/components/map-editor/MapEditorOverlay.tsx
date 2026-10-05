import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import type { Point } from '@pixoffice/runtime/model'
import type { MapDraftSnapshot } from '@pixoffice/runtime/map/MapDraft'
import { checkFurniturePlacement, snapFurniture } from '@pixoffice/runtime/map/placement'
import type { EditorProps, MapFurniture } from './commands.ts'
import { editMap } from './commands.ts'
import { SceneFault } from '@pixoffice/runtime/protocol'

type Gesture = { prop: MapFurniture; start: Point; draft: MapDraftSnapshot; pointerId: number }
const equal = (a: Point, b: Point) => a.x === b.x && a.y === b.y
const pointsText = (points: Point[]) => points.map(p => `${p.x},${p.y}`).join(' ')

export function MapEditorOverlay({ runtime, draft, view, setView, onError, onPreview, onHighlight }: EditorProps & { onPreview: (value?: MapFurniture) => void; onHighlight: (id: string, valid: boolean) => void }) {
  const svg = useRef<SVGSVGElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const [dragging, setDragging] = useState<MapFurniture>()
  const [placement, setPlacement] = useState<{ id: string; position: Point }>()
  const [routeFrom, setRouteFrom] = useState<Point | null>(null)
  const doc = draft.document
  const candidate = useMemo(() => dragging ?? (view.placing ? { ...view.placing, position: placement?.id === view.placing.id ? placement.position : view.placing.position } : undefined), [dragging, view.placing, placement])
  const validity = useMemo(() => candidate ? checkFurniturePlacement(doc, candidate, runtime.readWorld(), id => runtime.template(id), runtime.navigation) : undefined, [doc, candidate, runtime])
  const selectedId = candidate?.id ?? view.selection
  useEffect(() => { onHighlight(selectedId, validity?.valid !== false) }, [selectedId, validity?.valid, onHighlight])
  useEffect(() => { onPreview(candidate) }, [candidate, onPreview])
  useEffect(() => () => { onPreview(); onHighlight('', true) }, [onPreview, onHighlight])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest('input,textarea,select,dialog,[contenteditable=true]')) return
      if (event.key === 'Escape') {
        gesture.current = null; setDragging(undefined); setRouteFrom(null)
        setView(v => ({ ...v, placing: undefined, selection: '', tool: 'select' })); onError(null)
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !gesture.current) {
        event.preventDefault()
        try { editMap(runtime, { action: event.shiftKey ? 'redo' : 'undo' }); onError(null) }
        catch (error) { onError(error instanceof Error ? error.message : '编辑失败') }
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [runtime, onError, setView])
  const pointOf = (event: PointerEvent): Point => {
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse())
    return { x: point.x, y: point.y }
  }
  const cancelDrag = () => { gesture.current = null; setDragging(undefined) }
  const apply = (prop: MapFurniture, reference = draft) => {
    try {
      editMap(runtime, { action: 'patch', operations: [{ op: 'prop.put', prop }], requireValid: true }, reference)
      setView(v => ({ ...v, selection: prop.id, placing: undefined })); onError(null)
    } catch (error) {
      const messages: Record<string, string> = { OVERLAP: '家具太近或占地重叠，未移动。', OUT_OF_BOUNDS: '家具超出房间范围，未移动。', SEAT_BLOCKED: '椅子的入座通道被挡住了，未移动。', NO_ROUTE: '这里会堵住人物的通道，未移动。', DRAFT_CONFLICT: '布局刚刚被更新了，请重新选择位置。' }
      onError(error instanceof SceneFault ? messages[error.code] ?? error.message : '这里暂时无法摆放')
    }
  }
  const move = (event: PointerEvent) => {
    const current = gesture.current, point = pointOf(event)
    if (current && event.pointerId === current.pointerId) {
      if (Math.hypot(point.x - current.start.x, point.y - current.start.y) < .08 && !dragging) return
      const position = snapFurniture({ x: current.prop.position.x + point.x - current.start.x, y: current.prop.position.y + point.y - current.start.y })
      setDragging(old => old && equal(old.position, position) ? old : { ...current.prop, position })
    } else if (view.placing) {
      const position = snapFurniture(point)
      setPlacement(old => old?.id === view.placing!.id && equal(old.position, position) ? old : { id: view.placing!.id, position })
    }
  }
  const finish = (event: PointerEvent) => {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    const point = pointOf(event)
    // A pointer-up can arrive before the last preview frame has rendered.
    const position = Math.hypot(point.x - current.start.x, point.y - current.start.y) < .08 && !dragging ? current.prop.position
      : snapFurniture({ x: current.prop.position.x + point.x - current.start.x, y: current.prop.position.y + point.y - current.start.y })
    cancelDrag()
    if (svg.current?.hasPointerCapture(event.pointerId)) svg.current.releasePointerCapture(event.pointerId)
    if (!equal(position, current.prop.position)) apply({ ...current.prop, position }, current.draft)
  }
  const route = draft.route
  return <>
    <svg ref={svg} className={`map-overlay ${candidate ? 'is-moving' : ''} tool-${view.tool}`} viewBox={`0 0 ${doc.width} ${doc.height}`} aria-label="家具布置画布"
      onPointerMove={move} onPointerUp={finish} onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag} onPointerDown={event => {
        if (event.button !== 0) return
        const raw = pointOf(event)
        if (view.placing) { apply({ ...view.placing, position: snapFurniture(raw) }); return }
        const point = { x: Math.round(raw.x / doc.gridSize) * doc.gridSize, y: Math.round(raw.y / doc.gridSize) * doc.gridSize }
        if (view.tool === 'route') {
          if (!routeFrom) setRouteFrom(point)
          else {
            try { editMap(runtime, { action: 'route', from: routeFrom, to: point }); onError(null) }
            catch (error) { onError(error instanceof Error ? error.message : '路线测试失败') }
            setRouteFrom(null)
          }
        } else setView(v => ({ ...v, selection: '' }))
      }}>
      {[...doc.props].sort((a, b) => a.position.y - b.position.y).map(prop => {
        const t = runtime.template(prop.templateId), position = dragging?.id === prop.id ? dragging.position : prop.position
        return <rect key={prop.id} className="room-furniture-hit" x={position.x} y={position.y + (t.view === 'whiteboard' ? -1 : 0)} width={t.footprint.right - t.footprint.left} height={t.view === 'whiteboard' ? 2 : t.footprint.bottom - t.footprint.top} fill="transparent" onPointerDown={event => {
          if (event.button !== 0 || view.tool !== 'select' || view.placing) return
          event.preventDefault(); event.stopPropagation(); onError(null)
          setView(v => ({ ...v, selection: prop.id }))
          gesture.current = { prop, start: pointOf(event), draft, pointerId: event.pointerId }
          svg.current!.setPointerCapture(event.pointerId)
        }}><title>{prop.name}</title></rect>
      })}
      {view.tool === 'route' && <g pointerEvents="none">
        {route?.points.length ? <polyline points={pointsText(route.points.map(p => ({ x: p.x + .5, y: p.y + .5 })))} stroke="#388b8b" strokeWidth=".05" strokeLinecap="round" strokeLinejoin="round" fill="none" /> : null}
        {[routeFrom ?? route?.from, routeFrom ? null : route?.to].map((p, i) => p && <circle key={i} cx={p.x + .5} cy={p.y + .5} r=".12" fill={i === 0 ? '#388b8b' : '#d98270'} stroke="white" strokeWidth=".04" />)}
      </g>}
    </svg>
    {view.tool === 'route' && <div className="room-route-status" role="status">{routeFrom ? '终点待选' : route ? route.error?.message ?? `${route.distance} 格 · ${route.turns} 次转弯` : '起点待选'}</div>}
  </>
}
