import { useEffect, useRef, useState } from 'react'
import { mountScene } from '@pixoffice/renderer-pixi'
import type { SceneRuntime, Snapshot } from '@pixoffice/runtime'
import { connectSceneRelay } from '@pixoffice/runtime/adapters/sse'
import { createFarmClock, cropStatus, inventoryStateSchema, tendFarm } from '@pixoffice/scene-farm'
import type { CropId } from '@pixoffice/scene-farm'
import { farmPersistence, readFarmSave } from '../storage.ts'
import { SceneHost } from '../../../shared/scene/SceneHost.ts'

type Mounted = Awaited<ReturnType<typeof mountScene>>
const pending = (status: string) => ['running', 'queued'].includes(status)
const base = (runtime: SceneRuntime) => ({ protocolVersion: '2.0' as const, sceneId: runtime.sceneId, commandId: crypto.randomUUID() })
export function useFarmController({ assetBaseUrl, relayUrl }: { assetBaseUrl: string; relayUrl?: string }) {
  const [save] = useState(readFarmSave), [clock] = useState(() => createFarmClock(save.clockMs))
  const [host] = useState(() => new SceneHost())
  const mounted = useRef<Mounted | null>(null), auto = useRef(false)
  const [loaded, setLoaded] = useState(false), [ready, setReady] = useState(false), [loading, setLoading] = useState('正在准备农场…')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [now, setNow] = useState(clock.now())
  const [error, setError] = useState(save.error), [automatic, setAutomatic] = useState(false), [speed, setSpeed] = useState(1), [transport, setTransport] = useState('未连接')
  const [plotId, setPlotId] = useState('plot-1'), [farmerId, setFarmerId] = useState('farmer-1'), [crop, setCrop] = useState<CropId>('carrot')
  const lastError = useRef('')
  useEffect(() => {
    const controller = new AbortController()
    let scene: Mounted | undefined, disconnect: (() => void) | undefined, timer: ReturnType<typeof setInterval> | undefined, savedAt = 0
    let executionTime = Date.now()
    setLoaded(false); setReady(false)
    const persistence = save.error ? undefined : farmPersistence(clock, save.checkpoint)
    const refresh = () => {
      if (!scene) return
      if (auto.current && clock.speed > 0) tendFarm(scene.runtime, clock.now(), () => crypto.randomUUID())
      const current = scene.runtime.snapshot(); setSnapshot(current); setNow(clock.now())
      if (current.persistenceError) { setError(current.persistenceError); auto.current = false; setAutomatic(false) }
      const failed = [...current.records].reverse().find(r => r.error && ['failed', 'rejected'].includes(r.status))
      if (failed && failed.command.commandId !== lastError.current) { lastError.current = failed.command.commandId; setError(failed.error!.message) }
      if (persistence && clock.now() - savedAt >= 2000 && !current.persistenceError) {
        try { persistence.save(scene.runtime.checkpoint()); savedAt = clock.now() } catch (reason) { auto.current = false; setAutomatic(false); setError(`存档失败：${reason instanceof Error ? reason.message : String(reason)}`) }
      }
    }
    void mountScene(host.element, async signal => {
      const { createFarmAssembly } = await import('../assembly.ts')
      return createFarmAssembly(assetBaseUrl, clock.now, signal)
    }, { signal: controller.signal, runtime: { persistence, now: () => executionTime }, step(runtime, elapsed) {
      if (clock.speed > 0) { executionTime += elapsed; clock.advance(elapsed); runtime.tick(elapsed) }
    }, view: {
      onActorClick: ({ actorId }) => setFarmerId(actorId),
      onPropClick: ({ propId }) => { if (propId.startsWith('plot-')) setPlotId(propId) },
      onLoadProgress: p => setLoading(`正在准备农场 ${p.completed}/${p.total}`),
      onActionProgress: p => {
        if (controller.signal.aborted) return
        setReady(p.ready); setLoading(p.error ?? `正在准备动作 ${p.completed}/${p.total}`)
        if (p.error) setError(p.error)
        if (p.ready && relayUrl && scene && !disconnect) disconnect = connectSceneRelay(scene.runtime, relayUrl, setTransport)
      },
    } }).then(result => {
      if (controller.signal.aborted) { result.dispose(); return }
      scene = result; mounted.current = result; setLoaded(true); setReady(result.view.areActionsReady); refresh(); timer = setInterval(refresh, 250)
      if (relayUrl && result.view.areActionsReady && !disconnect) disconnect = connectSceneRelay(result.runtime, relayUrl, setTransport)
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { clearInterval(timer); disconnect?.(); auto.current = false; controller.abort(); mounted.current = null }
  }, [assetBaseUrl, relayUrl, clock, save, host])

  const plots = snapshot?.world.props.filter(p => p.templateId === 'farm.plot') ?? []
  const plot = plots.find(p => p.id === plotId), state = plot ? cropStatus(plot.state, now) : null
  const inventory = snapshot ? inventoryStateSchema.parse(snapshot.world.props.find(p => p.id === 'harvest-store')!.state) : { carrot: 0, tomato: 0, cabbage: 0 }
  const active = snapshot?.records.filter(r => r.command.type === 'activity.start' && pending(r.status)) ?? []
  const actorBusy = active.some(r => r.command.type === 'activity.start' && r.command.participants.some(p => p.entityId === farmerId))
  const plotBusy = active.some(r => r.command.type === 'activity.start' && r.command.params.plotId === plotId)
  const operation = state?.stage === 'empty' ? 'plant' : state?.stage === 'thirsty' ? 'water' : state?.stage === 'ready' ? 'harvest' : null
  const phases = snapshot?.activities.filter(activity => activity.status === 'active').map(activity => ({
    ...activity.plan.phases[activity.phaseIndex], participants: activity.participants,
  })) ?? []
  function start() {
    const runtime = mounted.current?.runtime
    if (!runtime || !operation || !plot || !ready || automatic || actorBusy || plotBusy || speed === 0 || relayUrl || snapshot?.persistenceError) return
    const result = runtime.submit({ ...base(runtime), type: 'activity.start', capability: `farm.${operation}`, participants: [{ entityId: farmerId, role: 'farmer' }], params: { plotId, ...(operation === 'plant' ? { crop } : {}) }, busyPolicy: 'reject' })
    if (result.error) setError(result.error.message)
    setSnapshot(runtime.snapshot())
  }
  function toggleAutomatic() { auto.current = !auto.current; setAutomatic(auto.current); setError('') }
  function stop() {
    auto.current = false; setAutomatic(false)
    const runtime = mounted.current?.runtime
    if (!runtime) return
    for (const record of active) runtime.submit({ ...base(runtime), type: 'command.cancel', targetCommandId: record.command.commandId })
    setSnapshot(runtime.snapshot())
  }
  function changeSpeed(value: number) { clock.setSpeed(value); setSpeed(value) }
  function retryActions() { setError(''); void mounted.current?.view.prepareActions() }
  return { host, loaded, ready, loading, snapshot, now, error, setError, automatic, speed, transport,
    plotId, setPlotId, farmerId, setFarmerId, crop, setCrop, plots, plot, state, inventory, active, actorBusy, plotBusy,
    operation, phases, start, toggleAutomatic, stop, changeSpeed, retryActions, saveError: save.error }
}
export type FarmController = ReturnType<typeof useFarmController>
