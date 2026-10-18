import { useEffect, useRef, useState } from 'react'
import { Armchair, Grid2X2, Square, RotateCcw } from 'lucide-react'
import { mountScene } from '@pixoffice/renderer-pixi'
import { browserPersistence } from '@pixoffice/runtime/adapters/storage'
import type { SceneRuntime, Snapshot } from '@pixoffice/runtime'
import type { SceneCommand } from '@pixoffice/protocol'
import { createDimetricAssembly, product } from './assembly.ts'
import './style.css'

export default function App() {
  const host = useRef<HTMLDivElement>(null), runtime = useRef<SceneRuntime | null>(null)
  const view = useRef<Awaited<ReturnType<typeof mountScene>>['view'] | null>(null)
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [state, setState] = useState<Snapshot>()
  const [selected, setSelected] = useState(''), [editing, setEditing] = useState(false)
  function submit(command: Omit<Extract<SceneCommand, { type: 'activity.start' }>, 'protocolVersion' | 'sceneId' | 'commandId'>) {
    const rt = runtime.current
    if (!rt) return
    const result = rt.submit({ ...command, protocolVersion: '2.0', sceneId: rt.sceneId, commandId: crypto.randomUUID(), busyPolicy: 'reject' })
    setError(result.error?.message ?? '')
  }
  useEffect(() => {
    const abort = new AbortController()
    let mounted: Awaited<ReturnType<typeof mountScene>> | undefined, unsubscribe: (() => void) | undefined
    void mountScene(host.current!, async () => createDimetricAssembly(), {
      signal: abort.signal,
      runtime: { persistence: browserPersistence(localStorage, 'dimetric-lab', product.storageNamespace) },
      view: {
        onActionProgress: p => setReady(p.ready),
        onCellClick: ({ cell }) => {
          setSelected(`${cell.x}, ${cell.y}`)
          submit({ type: 'activity.start', capability: 'scene.move', participants: [{ entityId: 'visitor', role: 'actor' }], params: { targetId: 'origin', anchor: `cell-${cell.x}-${cell.y}` } })
        },
        onPropClick: ({ propId }) => setSelected(propId),
      },
    }).then(result => {
      mounted = result; runtime.current = result.runtime; view.current = result.view
      if (abort.signal.aborted) { result.dispose(); return }
      unsubscribe = result.runtime.subscribe(() => setState(result.runtime.snapshot()))
      setState(result.runtime.snapshot())
    }).catch(e => { if (!abort.signal.aborted) setError(String(e)) })
    return () => { abort.abort(); unsubscribe?.(); mounted?.dispose(); runtime.current = null; view.current = null }
  }, [])
  const actor = state?.world.actors[0]
  const activity = state?.activities.find(a => a.status === 'active')
  return <main>
    <header><div><strong>PixOffice</strong><span>轴测装配</span></div><span className="tag">{ready ? '就绪' : '准备中'}</span></header>
    <div className="workspace">
      <section className="stage"><div ref={host} className="canvas" aria-label="轴测场景" /></section>
      <aside>
        <h1>场景状态</h1>
        <dl><dt>产品</dt><dd>Dimetric</dd><dt>投影</dt><dd>2:1 · 64 × 32</dd><dt>位置</dt><dd>{actor ? `${actor.position.x}, ${actor.position.y}` : '—'}</dd><dt>选中</dt><dd>{selected || '—'}</dd><dt>当前活动</dt><dd>{activity?.plan.title ?? '待命'}</dd><dt>姿态</dt><dd>{actor?.posture === 'seated' ? '坐姿' : '站姿'}</dd></dl>
        <div className="commands">
          <button disabled={!ready || editing} onClick={() => submit({ type: 'activity.start', capability: 'lab.work', participants: [{ entityId: 'visitor', role: 'actor' }], params: {} })}><Armchair size={17} />入座工作</button>
          <button disabled={!ready || !activity} onClick={() => { if (activity) runtime.current?.submit({ protocolVersion: '2.0', sceneId: 'dimetric-lab', commandId: crypto.randomUUID(), type: 'activity.stop', activityId: activity.id }) }}><Square size={16} />停止</button>
          <button disabled={!ready} aria-pressed={editing} onClick={() => { try { if (editing) view.current?.cancelEditing(); else view.current?.beginEditing(); setEditing(!editing); setError('') } catch (e) { setError(String(e)) } }}><Grid2X2 size={17} />{editing ? '关闭网格' : '网格预览'}</button>
          <button disabled={!ready || editing} onClick={() => submit({ type: 'activity.start', capability: 'scene.move', participants: [{ entityId: 'visitor', role: 'actor' }], params: { targetId: 'origin', anchor: 'cell-2-6' } })}><RotateCcw size={17} />返回起点</button>
        </div>
        {error && <p role="alert">{error}</p>}
        <h2>执行记录</h2>
        <ol>{state?.records.slice(-5).reverse().map(record => <li key={record.command.commandId}><span>{record.command.type === 'activity.start' ? record.command.capability : record.command.type}</span><small>{record.status}</small></li>)}</ol>
      </aside>
    </div>
  </main>
}
