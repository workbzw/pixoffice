import '../studio.css'
import './StudioScene.css'
import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowUpRight, Box, Check, CircleAlert, FileText, Lightbulb } from 'lucide-react'
import { SceneSurface } from '../../../../shared/scene/SceneSurface.tsx'
import type { StudioController } from '../controller/useStudioController.ts'
import { workers } from '../data.ts'
import type { WorkerId } from '../data.ts'
import { roomSize, stationPoint } from '../geometry.ts'
import { Meter } from '../ui/components.tsx'

const bubblePositions: Record<WorkerId, { left: number; top: number }> = {
  wang: { left: 90, top: 197 }, zhou: { left: 1210, top: 222 },
  li: { left: 350, top: 532 }, chen: { left: 795, top: 559 }, liu: { left: 1214, top: 538 },
}

export function StudioScene({ controller, children }: { controller: StudioController; children?: ReactNode }) {
  const { host, state, ready, error, bubbles } = controller
  const viewport = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState({ scale: 1, x: 0, y: 0 })
  const finished = state.completed === workers.length
  useLayoutEffect(() => {
    const el = viewport.current!
    const resize = () => {
      const { width, height } = el.getBoundingClientRect(), scale = Math.min(width / roomSize.width, height / roomSize.height)
      setFit({ scale, x: (width - roomSize.width * scale) / 2, y: (height - roomSize.height * scale) / 2 })
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(el); return () => observer.disconnect()
  }, [])

  return <main className="studio-stage" ref={viewport}>
    <SceneSurface host={host} className="studio-canvas" />
    {ready && <>
        <div className="studio-world-ui" style={{ transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})` }}>
          <section className="studio-board-content" aria-label="项目白板">
            <div className="studio-board-heading"><Lightbulb size={40} /><h1>{finished ? '已完成' : state.running ? '执行中' : '已暂停'}</h1><span>把计划变成成果</span></div>
            <div className="studio-board-columns"><div className="studio-board-summary"><FileText size={24} /><h2>竞品对比报告</h2><p>对标产品、核验信息，<br />找到下一步的机会。</p><button onClick={controller.openFiles}>查看项目资料 <ArrowUpRight size={16} /></button><div className="studio-board-note">更好的产品<br />源于真实的比较。</div></div>
              <div className="studio-board-tasks">{workers.slice(0, 3).map((w, i) => { const task = state.tasks.find(t => t.workerId === w.id)!; return <button key={w.id} onClick={() => controller.selectWorker(w.id)}><span className={`studio-number n-${i}`}>{i + 1}</span><span><strong>{w.role}</strong><Meter value={task.progress} warning={task.status === 'blocked'} /></span><small>{Math.floor(task.progress)}%</small></button> })}</div>
            </div>
          </section>
          {workers.map(w => { const task = state.tasks.find(t => t.workerId === w.id)!, p = stationPoint(w.position); return <div key={w.id}>
            <button className="studio-nameplate" style={{ left: p.x - (w.id === 'zhou' ? 220 : 103), top: p.y - 94 }} onClick={() => controller.selectWorker(w.id)}><strong>{w.name}<span className={`studio-person-dot is-${task.status}`} /></strong><span>{w.role}</span></button>
            {bubbles && <button className={`studio-task-bubble is-${task.status}`} style={bubblePositions[w.id]} onClick={() => controller.selectWorker(w.id)}>
              <span className="studio-bubble-title">{task.status === 'blocked' ? <CircleAlert size={19} /> : <Check size={19} />}<strong>{w.role}</strong></span><span className="studio-bubble-note">{task.status === 'blocked' ? '2 处数据口径等待确认' : task.status === 'done' ? '已完成，结果汇入资料库' : w.task}</span><div className="studio-meter-row"><Meter value={task.progress} warning={task.status === 'blocked'} /><span>{Math.floor(task.progress)}%</span></div>
            </button>}
          </div> })}
        </div>
    </>}
      {!ready && <div className="studio-loading"><Box size={36} /><strong>{error ? '办公室加载失败' : '正在布置办公室'}</strong><span>{error || '准备房间、工位与项目白板'}</span>{error && <button onClick={() => location.reload()}>重新加载</button>}</div>}
    {children}
  </main>
}
