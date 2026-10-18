import '../studio.css'
import './StudioShell.css'
import { useEffect, useState } from 'react'
import { Activity, ArrowDownToLine, ArrowLeft, ArrowUpRight, Bell, BookOpen, Box, ChartNoAxesCombined, CheckCheck, ChevronRight, Eye, EyeOff, FileText, FolderKanban, House, ListTodo, Pause, Play, RotateCcw, Users } from 'lucide-react'
import type { SceneSlot } from '../../../../shared/scene/layout.tsx'
import type { StudioController } from '../controller/useStudioController.ts'
import { formatTime, reportText, workers } from '../data.ts'
import type { StudioSnapshot, WorkerId } from '../data.ts'
import { Avatar, Dialog, Meter, TaskState } from './components.tsx'

type Panel = 'project' | 'tasks' | 'members' | 'files' | 'analytics' | 'worker' | null
const navigation = [
  { id: null, name: '办公空间', icon: House }, { id: 'project', name: '项目', icon: FolderKanban },
  { id: 'tasks', name: '任务', icon: ListTodo }, { id: 'members', name: '成员', icon: Users },
  { id: 'files', name: '资料库', icon: BookOpen }, { id: 'analytics', name: '数据看板', icon: ChartNoAxesCombined },
] as const
function downloadReport(state: StudioSnapshot) {
  const url = URL.createObjectURL(new Blob([reportText(state)], { type: 'text/plain;charset=utf-8' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = '竞品对比报告-演示.txt'; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export interface StudioShellProps { controller: StudioController; scene: SceneSlot }
export function StudioShell({ controller, scene }: StudioShellProps) {
  const { state, ready, selected, bubbles, setBubbles, request } = controller
  const [panel, setPanel] = useState<Panel>(null), [notice, setNotice] = useState(''), [previewFile, setPreviewFile] = useState(false)
  useEffect(() => { if (request) { setPanel(request.kind); setNotice('') } }, [request])
  const onWorker = (id: WorkerId) => { controller.selectWorker(id); setNotice(''); setPanel('worker') }
  const worker = workers.find(w => w.id === selected)!, selectedTask = state.tasks.find(t => t.workerId === selected)!
  const finished = state.completed === workers.length, blocked = state.tasks.filter(t => t.status === 'blocked').length
  const titles = { project: '竞品对比报告', tasks: '团队任务', members: '项目成员', files: '项目资料库', analytics: '数据看板', worker: `${worker.name}的工作台` }
  const close = () => setPanel(null)
  const resolve = controller.resolveConflict
  const taskRows = <div className="studio-task-list">{workers.map(w => {
    const task = state.tasks.find(t => t.workerId === w.id)!
    return <article className="studio-task-row" key={w.id}>
      <button className="studio-member-link" onClick={() => onWorker(w.id)}><Avatar worker={w} /><span><strong>{w.name}</strong><small>{w.role}</small></span></button>
      <div className="studio-task-detail"><div><strong>{w.task}</strong><TaskState task={task} /></div><p>{task.note}</p><div className="studio-meter-row"><Meter value={task.progress} warning={task.status === 'blocked'} /><span>{Math.floor(task.progress)}%</span></div>
        {task.status === 'blocked' && <button className="studio-text-button" onClick={resolve}><CheckCheck size={16} />确认示例口径，继续校验</button>}
      </div>
    </article>
  })}</div>


  return <div className="studio-root">
    <aside className="studio-sidebar">
      <a className="studio-brand" href="/"><Box size={32} strokeWidth={2.8} /><span>PixOffice</span></a>
      <p className="studio-motto">让好想法<br />在这里变成现实</p>
      <nav aria-label="办公室导航">{navigation.map(item => <button key={item.name} aria-label={item.name} title={item.name} className={panel === item.id || (item.id === 'members' && panel === 'worker') ? 'is-active' : ''} onClick={() => { setPanel(item.id); setPreviewFile(false) }}><item.icon size={21} /><span>{item.name}</span>{item.id === 'tasks' && blocked > 0 && <i>{blocked}</i>}</button>)}</nav>
      <div className="studio-sidebar-bottom"><p>一群有趣的人<br />做有价值的事</p><a href="?view=lab"><Activity size={15} /> 轴测实验室 <ArrowUpRight size={13} /></a></div>
    </aside>

    {scene(ready && <>
        <section className="studio-project-card">
          <div className="studio-project-heading"><span className="studio-file-symbol"><FileText size={23} /></span><button onClick={() => setPanel('project')}>竞品对比报告 <ChevronRight size={16} /></button><span className="studio-project-state">{finished ? '已完成' : state.running ? '执行中' : '已暂停'}</span></div>
          <div className="studio-project-progress"><Meter value={state.progress} /><strong>{state.progress}%</strong></div>
          <div className="studio-project-members"><span><Users size={15} /> 项目成员</span><div>{workers.map(w => <button key={w.id} title={`${w.name} · ${w.role}`} aria-label={`查看${w.name}`} onClick={() => onWorker(w.id)}><Avatar worker={w} /></button>)}</div></div>
        </section>

        <div className="studio-scene-bottom"><button className="studio-activity" onClick={() => setPanel('project')}><span className="studio-dot" /><span>{state.log[0].text}</span><ChevronRight size={14} /></button><div className="studio-controls"><button className="studio-icon-button" title={state.running ? '暂停演示' : '继续演示'} aria-label={state.running ? '暂停演示' : '继续演示'} onClick={() => controller.setRunning(!state.running)}>{state.running ? <Pause size={19} /> : <Play size={19} />}</button><button className="studio-icon-button" title="重新开始" aria-label="重新开始" onClick={controller.restart}><RotateCcw size={18} /></button><span className="studio-control-divider" /><button className="studio-icon-button" title={bubbles ? '隐藏任务气泡' : '显示任务气泡'} aria-label={bubbles ? '隐藏任务气泡' : '显示任务气泡'} aria-pressed={bubbles} onClick={() => setBubbles(!bubbles)}>{bubbles ? <Eye size={19} /> : <EyeOff size={19} />}</button></div></div>
    </>)}
    <footer className="studio-footer"><span><span className="studio-dot" /> 本地演示</span><span className="studio-footer-phrase">专注 · 协作 · 成长</span><span className="studio-footer-description">把复杂的事情，变成清晰的下一步。</span><time>{formatTime(state.elapsed)}</time></footer>

    {panel && <Dialog title={titles[panel]} onClose={close}>
      {panel === 'project' && <><div className="studio-panel-overview"><span className="studio-eyebrow">PROJECT / 01</span><h3>从信息到判断</h3><p>搜集、校验、整理、撰写与分析。五位成员共同完成一份竞品对比报告。</p><div className="studio-metrics"><span><strong>{state.progress}%</strong>整体进度</span><span><strong>{state.completed}/5</strong>已完成任务</span><span><strong>{blocked}</strong>待确认事项</span></div><Meter value={state.progress} /></div><h3 className="studio-section-title">实时动态</h3><ol className="studio-log">{state.log.map(item => <li key={item.id}><time>{formatTime(item.time)}</time><span>{item.text}</span></li>)}</ol><button className="studio-primary" onClick={() => setPanel('tasks')}>查看团队任务 <ArrowUpRight size={16} /></button></>}
      {panel === 'tasks' && taskRows}
      {panel === 'members' && <div className="studio-member-grid">{workers.map(w => <button key={w.id} onClick={() => onWorker(w.id)}><Avatar worker={w} large /><strong>{w.name}</strong><span>{w.role}</span><p>{state.tasks.find(t => t.workerId === w.id)!.note}</p><TaskState task={state.tasks.find(t => t.workerId === w.id)!} /></button>)}</div>}
      {panel === 'worker' && <><div className="studio-worker-head"><Avatar worker={worker} large /><div><h3>{worker.name}</h3><p>{worker.role}</p></div><TaskState task={selectedTask} /></div><h3>{worker.task}</h3><p className="studio-muted">{selectedTask.note}</p><div className="studio-meter-row"><Meter value={selectedTask.progress} warning={selectedTask.status === 'blocked'} /><strong>{Math.floor(selectedTask.progress)}%</strong></div><div className="studio-worker-actions">{selectedTask.status === 'blocked' ? <button className="studio-primary" onClick={resolve}><CheckCheck size={17} />确认口径，继续校验</button> : <button className="studio-primary" onClick={() => { const accepted = controller.visit(worker.id); setNotice(accepted ? `派派正在前往${worker.name}的工位` : '派派正在前往另一位成员的工位，请稍后再试') }}><Bell size={17} />同步进度</button>}<button className="studio-secondary" onClick={() => { setPanel('files'); setPreviewFile(false) }}><FileText size={17} />项目资料</button></div>{notice && <p className="studio-notice" role="status">{notice}</p>}<h3 className="studio-section-title">工作记录</h3><ol className="studio-log">{state.log.filter(item => item.text.includes(worker.name)).length ? state.log.filter(item => item.text.includes(worker.name)).map(item => <li key={item.id}><time>{formatTime(item.time)}</time><span>{item.text}</span></li>) : <li><time>00:00</time><span>已接收任务：{worker.task}</span></li>}</ol></>}
      {panel === 'files' && <>{previewFile ? <><button className="studio-text-button" onClick={() => setPreviewFile(false)}><ArrowLeft size={16} />返回资料库</button><pre className="studio-file-preview">{reportText(state)}</pre></> : <><p className="studio-muted">竞品研究 · 当前演示项目</p><button className="studio-file-row" onClick={() => setPreviewFile(true)}><FileText size={26} /><span><strong>竞品对比报告.txt</strong><small>项目进度与示例研究摘要</small></span><ChevronRight size={19} /></button><p className="studio-file-disclaimer">演示内容不代表真实调研结果。</p></>}<button className="studio-primary" onClick={() => downloadReport(state)}><ArrowDownToLine size={17} />下载当前报告</button></>}
      {panel === 'analytics' && <><p className="studio-muted">竞品对比 · 示例数据</p><table className="studio-comparison"><thead><tr><th>对比项</th><th>产品 A</th><th>产品 B</th></tr></thead><tbody><tr><td>市场定位</td><td>完整功能</td><td>轻量体验</td></tr><tr><td>核心优势</td><td>协同管理</td><td>快速上手</td></tr><tr><td>定价口径</td><td>月付 / 年付</td><td>月付</td></tr><tr><td>核验状态</td><td colSpan={2}>{blocked ? '等待统一统计口径' : '示例口径已统一'}</td></tr></tbody></table><h3 className="studio-section-title">研究进展</h3>{workers.map(w => <div className="studio-analytics-row" key={w.id}><span>{w.role}</span><Meter value={state.tasks.find(t => t.workerId === w.id)!.progress} /><strong>{Math.floor(state.tasks.find(t => t.workerId === w.id)!.progress)}%</strong></div>)}</>}
    </Dialog>}
  </div>
}
