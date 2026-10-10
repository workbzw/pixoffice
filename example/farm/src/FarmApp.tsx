import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowUpRight, Check, CirclePause, Droplets, LoaderCircle, Pause, Play, RotateCcw, Shovel, Sprout, Square, Wheat, X } from 'lucide-react'
import { mountScene } from '@pixoffice/renderer-pixi'
import type { SceneRuntime, Snapshot } from '@pixoffice/runtime'
import { RuntimeHttpClient } from '@pixoffice/runtime/adapters/http'
import { createFarmClock, cropStatus, crops, farmRoster, inventoryStateSchema, tendFarm } from '@pixoffice/scene-farm'
import type { CropId } from '@pixoffice/scene-farm'
import { farmPersistence, readFarmSave } from './storage.ts'
import './farm.css'

type Mounted = Awaited<ReturnType<typeof mountScene>>
const pending = (status: string) => ['running', 'queued'].includes(status)
const base = (runtime: SceneRuntime) => ({ protocolVersion: '2.0' as const, sceneId: runtime.sceneId, commandId: crypto.randomUUID() })
export function FarmApp({ assetBaseUrl, homeUrl, officeUrl, classroomUrl, gatewayUrl }: { assetBaseUrl: string; homeUrl?: string; officeUrl?: string; classroomUrl?: string; gatewayUrl?: string }) {
  const [save] = useState(readFarmSave), [clock] = useState(() => createFarmClock(save.clockMs))
  const host = useRef<HTMLDivElement>(null), mounted = useRef<Mounted | null>(null), auto = useRef(false)
  const [loaded, setLoaded] = useState(false), [ready, setReady] = useState(false), [loading, setLoading] = useState('正在准备农场…')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [now, setNow] = useState(clock.now())
  const [error, setError] = useState(save.error), [automatic, setAutomatic] = useState(false), [speed, setSpeed] = useState(1), [transport, setTransport] = useState('未连接')
  const [plotId, setPlotId] = useState('plot-1'), [farmerId, setFarmerId] = useState('farmer-1'), [crop, setCrop] = useState<CropId>('carrot')
  const lastError = useRef('')
  useEffect(() => {
    const controller = new AbortController()
    let scene: Mounted | undefined, client: RuntimeHttpClient | undefined, timer: ReturnType<typeof setInterval> | undefined, savedAt = 0
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
    void mountScene(host.current!, async signal => {
      const { createFarmAssembly } = await import('./assembly.ts')
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
        if (p.ready && gatewayUrl && scene && !client) { client = new RuntimeHttpClient(scene.runtime, gatewayUrl, setTransport); client.connect() }
      },
    } }).then(result => {
      if (controller.signal.aborted) { result.dispose(); return }
      scene = result; mounted.current = result; setLoaded(true); setReady(result.view.areActionsReady); refresh(); timer = setInterval(refresh, 250)
      if (gatewayUrl && result.view.areActionsReady && !client) { client = new RuntimeHttpClient(result.runtime, gatewayUrl, setTransport); client.connect() }
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { clearInterval(timer); client?.disconnect(); auto.current = false; controller.abort(); mounted.current = null }
  }, [assetBaseUrl, gatewayUrl, clock, save])

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
    if (!runtime || !operation || !plot || !ready || automatic || actorBusy || plotBusy || speed === 0 || gatewayUrl || snapshot?.persistenceError) return
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
  return <div className="farm-app">
    <header className="farm-header">
      <a className="farm-brand" href={homeUrl ?? '#'}><img className="farm-brand-logo" src={`${assetBaseUrl}pixoffice-logo.png`} alt="" width={36} height={36} /><strong>PixOffice</strong><span>农场</span></a>
      <nav aria-label="场景导航">{homeUrl && <a href={homeUrl}><ArrowLeft size={14} />首页</a>}{officeUrl && <a href={officeUrl}>办公室</a>}{classroomUrl && <a href={classroomUrl}>教室</a>}<span aria-current="page">农场</span></nav>
      <span className="farm-connection"><i />{gatewayUrl ? `外部驱动 · ${transport}` : ready ? '本地农场' : '正在准备'}</span>
    </header>
    <main className="farm-layout">
      <section className="farm-heading"><span className="farm-heading-icon"><img src={`${assetBaseUrl}chicken-logo.webp`} alt="" width={40} height={40} /></span><div><h1>小鸡农场</h1><p>2 位农夫 · 2 只小鸡 · 6 块菜地</p></div></section>
      <section className="farm-stats" aria-label="农场概况">
        <div><span>正在种植</span><strong>{plots.filter(p => p.state.crop).length}<small> / 6</small></strong></div>
        <div><span>成熟菜地</span><strong>{plots.filter(p => cropStatus(p.state, now).stage === 'ready').length}</strong></div>
        <div><span>累计收获</span><strong>{Object.values(inventory).reduce((sum, n) => sum + n, 0)}<small> 份</small></strong></div>
        <div><span>农场状态</span><strong className="farm-state">{speed === 0 ? '已暂停' : active.length ? `${active.length} 人劳作` : automatic ? '等待生长' : '悠闲时光'}</strong></div>
      </section>
      <aside className="farm-sidebar">
        <section><h2>菜地 <small>{plots.length}</small></h2><div className="farm-plot-list">{plots.map(p => {
          const status = cropStatus(p.state, now)
          return <button type="button" key={p.id} aria-pressed={plotId === p.id} onClick={() => setPlotId(p.id)}><span>{p.name}{plotId === p.id && <Check size={13} />}</span><strong>{status.crop ? crops[status.crop].name : '空地'}</strong><small>{status.label}</small></button>
        })}</div></section>
        <section className="farm-operation"><h2>{plot?.name ?? '种植安排'}<small>{state?.label}</small></h2>
          <label htmlFor="farm-person">农夫</label><select id="farm-person" value={farmerId} onChange={e => setFarmerId(e.target.value)}>{farmRoster.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          {state?.stage === 'empty' && <><label htmlFor="farm-crop">蔬菜</label><select id="farm-crop" value={crop} onChange={e => setCrop(e.target.value as CropId)}>{Object.entries(crops).map(([id, value]) => <option key={id} value={id}>{value.name}</option>)}</select></>}
          {state?.crop && <div className="farm-growth"><span>{crops[state.crop].name}</span><strong>{Math.round(state.progress * 100)}%</strong><progress max={1} value={state.progress} aria-label="作物生长进度" /></div>}
          <button className="farm-primary" type="button" disabled={!ready || automatic || actorBusy || plotBusy || !operation || speed === 0 || Boolean(gatewayUrl) || Boolean(snapshot?.persistenceError)} onClick={start}>{operation === 'water' ? <Droplets size={17} /> : operation === 'harvest' ? <Wheat size={17} /> : <Shovel size={17} />}{plotBusy ? '正在照料' : operation === 'plant' ? '播种' : operation === 'water' ? '浇水' : operation === 'harvest' ? '采收' : '等待生长'}</button>
        </section>
        <section><h2>收获箱 <Wheat size={16} /></h2><ul className="farm-inventory">{Object.entries(crops).map(([id, item]) => <li key={id}><span>{item.name}</span><strong>{inventory[id as CropId]} <small>份</small></strong></li>)}</ul></section>
      </aside>
      <section className="farm-scene" aria-label="农场动画区域" aria-busy={!loaded}>
        <div className="farm-scene-top"><span><i className={active.length ? 'busy' : ''} />{phases[0]?.title ?? (speed === 0 ? '农场已暂停' : automatic ? '作物正在生长' : '今天也是种菜的好日子')}</span><span>{Math.floor(now / 60000).toString().padStart(2, '0')}:{Math.floor(now / 1000 % 60).toString().padStart(2, '0')}</span></div>
        <div className="farm-canvas" ref={host} />
        {!loaded && <div className="farm-loading" role="status"><LoaderCircle size={24} />{error || loading}</div>}
        {loaded && !ready && <div className="farm-actions-loading">{error ? <button type="button" onClick={retryActions}><RotateCcw size={14} />重试动作</button> : <><LoaderCircle size={14} />{loading}</>}</div>}
        {error && <div className="farm-error" role="alert"><span>{error}</span><button type="button" aria-label="关闭错误" onClick={() => setError('')}><X size={15} /></button></div>}
        <div className="farm-scene-bottom">
          <div className="farm-workers">{farmRoster.map(p => <button type="button" aria-pressed={farmerId === p.id} key={p.id} onClick={() => setFarmerId(p.id)}><img src={`${assetBaseUrl}farm-gardener/portrait.webp`} alt="" /><span><strong>{p.name}</strong><small>{phases.find(phase => phase.participants.includes(p.id))?.title ?? '休息中'}</small></span></button>)}</div>
          <div className="farm-toolbar"><button className={automatic ? 'farm-primary' : ''} type="button" aria-pressed={automatic} disabled={!ready || Boolean(gatewayUrl) || Boolean(snapshot?.persistenceError)} onClick={toggleAutomatic}>{automatic ? <Pause size={16} /> : <Play size={16} />}自动照料</button>
            <div className="farm-speed" role="group" aria-label="农场速度">{[0, 1, 4].map(value => <button type="button" key={value} aria-label={value === 0 ? '暂停农场' : `${value} 倍生长速度`} title={value === 0 ? '暂停农场' : `${value} 倍生长速度`} aria-pressed={speed === value} onClick={() => changeSpeed(value)}>{value === 0 ? <CirclePause size={16} /> : `${value}×`}</button>)}</div>
            <button type="button" title="取消当前农作" aria-label="取消当前农作" disabled={!active.length} onClick={stop}><Square size={16} /></button>
          </div>
        </div>
      </section>
    </main>
    <footer className="farm-footer"><span><Sprout size={13} />PixOffice Farm</span><span>{save.error ? '临时农场 · 原存档已保留' : '本地存档 · 离线暂停生长'}</span>{homeUrl && <a href={homeUrl}>PixOffice <ArrowUpRight size={13} /></a>}</footer>
  </div>
}
