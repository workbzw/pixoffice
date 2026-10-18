import '../farm.css'
import './FarmShell.css'
import { ArrowLeft, ArrowUpRight, Check, CirclePause, Droplets, Pause, Play, Shovel, Sprout, Square, Wheat } from 'lucide-react'
import { cropStatus, crops, farmRoster } from '@pixoffice/scene-farm'
import type { CropId } from '@pixoffice/scene-farm'
import type { FarmController } from '../controller/useFarmController.ts'
import type { SceneSlot } from '../../../shared/scene/layout.tsx'

export interface FarmShellProps {
  controller: FarmController
  scene: SceneSlot
  assetBaseUrl: string
  homeUrl?: string
  officeUrl?: string
  classroomUrl?: string
  relayUrl?: string
}
export function FarmShell({ controller, scene, assetBaseUrl, homeUrl, officeUrl, classroomUrl, relayUrl }: FarmShellProps) {
  const { ready, transport, plots, plotId, setPlotId, plot, state, farmerId, setFarmerId, crop, setCrop, inventory,
    active, speed, automatic, phases, now, actorBusy, plotBusy, operation, snapshot, start, toggleAutomatic, stop, changeSpeed, saveError } = controller
  return <div className="farm-app">
    <header className="farm-header">
      <a className="farm-brand" href={homeUrl ?? '#'}><img className="farm-brand-logo" src={`${assetBaseUrl}pixoffice-logo.png`} alt="" width={36} height={36} /><strong>PixOffice</strong><span>农场</span></a>
      <nav aria-label="场景导航">{homeUrl && <a href={homeUrl}><ArrowLeft size={14} />首页</a>}{officeUrl && <a href={officeUrl}>办公室</a>}{classroomUrl && <a href={classroomUrl}>教室</a>}<span aria-current="page">农场</span></nav>
      <span className="farm-connection"><i />{relayUrl ? `外部驱动 · ${transport}` : ready ? '本地农场' : '正在准备'}</span>
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
          <button className="farm-primary" type="button" disabled={!ready || automatic || actorBusy || plotBusy || !operation || speed === 0 || Boolean(relayUrl) || Boolean(snapshot?.persistenceError)} onClick={start}>{operation === 'water' ? <Droplets size={17} /> : operation === 'harvest' ? <Wheat size={17} /> : <Shovel size={17} />}{plotBusy ? '正在照料' : operation === 'plant' ? '播种' : operation === 'water' ? '浇水' : operation === 'harvest' ? '采收' : '等待生长'}</button>
        </section>
        <section><h2>收获箱 <Wheat size={16} /></h2><ul className="farm-inventory">{Object.entries(crops).map(([id, item]) => <li key={id}><span>{item.name}</span><strong>{inventory[id as CropId]} <small>份</small></strong></li>)}</ul></section>
      </aside>
      {scene(<>
        <div className="farm-scene-top"><span><i className={active.length ? 'busy' : ''} />{phases[0]?.title ?? (speed === 0 ? '农场已暂停' : automatic ? '作物正在生长' : '今天也是种菜的好日子')}</span><span>{Math.floor(now / 60000).toString().padStart(2, '0')}:{Math.floor(now / 1000 % 60).toString().padStart(2, '0')}</span></div>
        <div className="farm-scene-bottom">
          <div className="farm-workers">{farmRoster.map(p => <button type="button" aria-pressed={farmerId === p.id} key={p.id} onClick={() => setFarmerId(p.id)}><img src={`${assetBaseUrl}farm-gardener/portrait.webp`} alt="" /><span><strong>{p.name}</strong><small>{phases.find(phase => phase.participants.includes(p.id))?.title ?? '休息中'}</small></span></button>)}</div>
          <div className="farm-toolbar"><button className={automatic ? 'farm-primary' : ''} type="button" aria-pressed={automatic} disabled={!ready || Boolean(relayUrl) || Boolean(snapshot?.persistenceError)} onClick={toggleAutomatic}>{automatic ? <Pause size={16} /> : <Play size={16} />}自动照料</button>
            <div className="farm-speed" role="group" aria-label="农场速度">{[0, 1, 4].map(value => <button type="button" key={value} aria-label={value === 0 ? '暂停农场' : `${value} 倍生长速度`} title={value === 0 ? '暂停农场' : `${value} 倍生长速度`} aria-pressed={speed === value} onClick={() => changeSpeed(value)}>{value === 0 ? <CirclePause size={16} /> : `${value}×`}</button>)}</div>
            <button type="button" title="取消当前农作" aria-label="取消当前农作" disabled={!active.length} onClick={stop}><Square size={16} /></button>
          </div>
        </div>
      </>)}
    </main>
    <footer className="farm-footer"><span><Sprout size={13} />PixOffice Farm</span><span>{saveError ? '临时农场 · 原存档已保留' : '本地存档 · 离线暂停生长'}</span>{homeUrl && <a href={homeUrl}>PixOffice <ArrowUpRight size={13} /></a>}</footer>
  </div>
}
