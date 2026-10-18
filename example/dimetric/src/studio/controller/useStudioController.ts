import { useEffect, useRef, useState } from 'react'
import { SceneHost } from '../../../../shared/scene/SceneHost.ts'
import { StudioEngine } from '../engine.ts'
import { initialSnapshot } from '../data.ts'
import type { WorkerId } from '../data.ts'
import { mountStudioView } from '../scene/mountStudioView.ts'

export function useStudioController() {
  const [host] = useState(() => new SceneHost())
  const engine = useRef<StudioEngine | null>(null), view = useRef<ReturnType<typeof mountStudioView> | null>(null)
  const [state, setState] = useState(initialSnapshot), [ready, setReady] = useState(false), [error, setError] = useState('')
  const [selected, setSelected] = useState<WorkerId>('wang'), [bubbles, setBubbles] = useState(true)
  const [request, setRequest] = useState<{ kind: 'worker' | 'files'; sequence: number } | null>(null)
  function selectWorker(id: WorkerId) { setSelected(id); setRequest(previous => ({ kind: 'worker', sequence: (previous?.sequence ?? 0) + 1 })) }
  function openFiles() { setRequest(previous => ({ kind: 'files', sequence: (previous?.sequence ?? 0) + 1 })) }
  useEffect(() => {
    const current = new StudioEngine()
    engine.current = current; setState(current.snapshot()); setReady(false); setError('')
    const mounted = mountStudioView(host.element, {
      engine: current, onReady: () => setReady(true), onChange: () => setState(current.snapshot()),
      onWorker: id => { setSelected(id); setRequest(previous => ({ kind: 'worker', sequence: (previous?.sequence ?? 0) + 1 })) }, onError: setError,
    })
    view.current = mounted
    return () => { mounted.dispose(); current.dispose(); engine.current = null; view.current = null }
  }, [host])
  const refresh = () => { if (engine.current) setState(engine.current.snapshot()) }
  function resolveConflict() { engine.current?.resolveConflict(); refresh() }
  function visit(id: WorkerId) { const accepted = engine.current?.visit(id); refresh(); return accepted }
  function setRunning(running: boolean) { engine.current?.setRunning(running); view.current?.syncRunning(); refresh() }
  function restart() { engine.current?.restart(); view.current?.syncRunning(); refresh() }
  return { host, state, ready, error, selected, selectWorker, openFiles, request, bubbles, setBubbles, resolveConflict, visit, setRunning, restart }
}
export type StudioController = ReturnType<typeof useStudioController>
