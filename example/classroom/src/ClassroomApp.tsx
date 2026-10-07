import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, BookOpen, Check, ChevronRight, GraduationCap, MessageCircle, Play, RotateCcw, Square, Users, X } from 'lucide-react'
import { mountScene } from '@pixoffice/renderer-pixi'
import type { SceneRuntime, SceneCommand } from '@pixoffice/runtime'
import { RuntimeHttpClient } from '@pixoffice/runtime/adapters/http'
import { classroomRoster } from '@pixoffice/scene-classroom'
import { lessons } from './lessons.ts'
import './classroom.css'

type Mounted = Awaited<ReturnType<typeof mountScene>>
type Entry = { id: string; text: string; time: string }
const students = classroomRoster.filter(p => p.role === 'student')
const allParticipants = classroomRoster.map(p => ({ entityId: p.id, role: p.role }))
const baseCommand = (runtime: SceneRuntime) => ({ protocolVersion: '2.0' as const, sceneId: runtime.sceneId, commandId: crypto.randomUUID() })
const isPending = (status: string) => status === 'running' || status === 'queued'

export function ClassroomApp({ assetBaseUrl, homeUrl, officeUrl, gatewayUrl }: { assetBaseUrl: string; homeUrl?: string; officeUrl?: string; gatewayUrl?: string }) {
  const host = useRef<HTMLDivElement>(null), mounted = useRef<Mounted | null>(null)
  const [ready, setReady] = useState(false), [loading, setLoading] = useState('正在准备教室…'), [error, setError] = useState('')
  const [transportStatus, setTransportStatus] = useState('未连接')
  const [lessonId, setLessonId] = useState<string>('solar'), [studentId, setStudentId] = useState<string>('student-1')
  const [phase, setPhase] = useState('等待上课'), [busy, setBusy] = useState(false), [completed, setCompleted] = useState(0)
  const [actorStates, setActorStates] = useState<Record<string, string>>({}), [history, setHistory] = useState<Entry[]>([])
  const [speech, setSpeech] = useState<{ name: string; text: string } | null>(null)
  const [boardOpen, setBoardOpen] = useState(false), [boardTitle, setBoardTitle] = useState<string>(lessons[0].title), [boardText, setBoardText] = useState<string>(lessons[0].board)
  const [draftTitle, setDraftTitle] = useState(''), [draftText, setDraftText] = useState('')
  const dialog = useRef<HTMLDialogElement>(null), lastPhase = useRef(''), lastError = useRef(''), actionReady = useRef(false)
  const lesson = lessons.find(l => l.id === lessonId) ?? lessons[0]

  useEffect(() => {
    const controller = new AbortController()
    let scene: Mounted | undefined, client: RuntimeHttpClient | undefined, timer: ReturnType<typeof setInterval> | undefined
    const refresh = () => {
      if (!scene) return
      const runtime = scene.runtime, phases = runtime.readActivePhases(), snapshot = runtime.snapshot()
      const board = snapshot.world.props.find(p => p.id === 'blackboard')
      if (board) { setBoardTitle(String(board.state.title ?? '')); setBoardText(String(board.state.text ?? '')) }
      const pending = snapshot.records.filter(r => r.command.type === 'activity.start' && isPending(r.status))
      const recovering = snapshot.world.actors.some(a => a.step || a.seatTransition)
      const current = phases[0], title = current?.title ?? (pending.length ? '等待前一项完成' : recovering ? '正在安全停下' : '课堂就绪')
      setPhase(title); setBusy(pending.length > 0 || recovering)
      setActorStates(Object.fromEntries(snapshot.world.actors.map(a => [a.id, a.step || a.seatTransition ? '走动中' : a.speech ? '正在发言' : a.posture === 'seated' ? current?.participants.includes(a.id) ? '听课中' : '在座' : '站立'])) )
      const speaking = snapshot.world.actors.find(a => a.speech)
      setSpeech(speaking ? { name: speaking.name, text: speaking.speech!.text } : null)
      setCompleted(snapshot.records.filter(r => r.command.type === 'activity.start' && r.status === 'completed').length)
      const key = current ? `${current.activityId}:${current.phaseIndex}` : ''
      if (key && key !== lastPhase.current) {
        lastPhase.current = key
        setHistory(previous => [{ id: key, text: title, time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }, ...previous].slice(0, 30))
      } else if (!key) lastPhase.current = ''
      const failed = [...snapshot.records].reverse().find(r => ['failed', 'rejected', 'expired'].includes(r.status))
      if (failed?.error && lastError.current !== failed.command.commandId) { lastError.current = failed.command.commandId; setError(failed.error.message) }
    }
    void mountScene(host.current!, async signal => {
      const { createClassroomAssembly } = await import('./assembly.ts')
      return createClassroomAssembly(assetBaseUrl, signal)
    }, { signal: controller.signal, view: {
      onActorClick: ({ actorId }) => { if (students.some(s => s.id === actorId)) setStudentId(actorId) },
      onLoadProgress: p => setLoading(`正在准备教室 ${p.completed}/${p.total}`),
      onActionProgress: p => {
        actionReady.current = p.ready
        setReady(p.ready && Boolean(mounted.current))
        setLoading(p.error ?? `正在准备动作 ${p.completed}/${p.total}`)
        if (p.error) setError(p.error)
      },
    } }).then(async result => {
      if (controller.signal.aborted) { result.dispose(); return }
      scene = result; mounted.current = result; setReady(actionReady.current || result.view.areActionsReady)
      refresh(); timer = setInterval(refresh, 250)
      if (gatewayUrl) {
        await result.view.prepareActions()
        if (!controller.signal.aborted && result.view.areActionsReady) {
          client = new RuntimeHttpClient(result.runtime, gatewayUrl, setTransportStatus); client.connect()
        }
      }
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { client?.disconnect(); controller.abort(); clearInterval(timer); mounted.current = null; actionReady.current = false }
  }, [assetBaseUrl, gatewayUrl])

  useEffect(() => { if (boardOpen) dialog.current?.showModal(); else dialog.current?.close() }, [boardOpen])

  function updateBoard(title: string, text: string) {
    const runtime = mounted.current?.runtime
    if (!runtime) return false
    const board = runtime.readWorld().props.find(p => p.id === 'blackboard')!
    const result = runtime.submit({ ...baseCommand(runtime), type: 'object.state.set', entityId: board.id, expectedStateRevision: board.stateRevision, state: { title, text } })
    if (result.error) { setError(result.error.message); return false }
    setBoardTitle(title); setBoardText(text); return true
  }
  function start(kind: 'demo' | 'lecture' | 'answer' | 'settle') {
    const runtime = mounted.current?.runtime
    if (!runtime || !ready || busy) return
    setError('')
    if (!updateBoard(boardTitle, boardText)) return
    const command = (capability: string, participants: { entityId: string; role: string }[], params: Record<string, string | number>): SceneCommand => ({
      ...baseCommand(runtime), type: 'activity.start', capability, participants, params, busyPolicy: 'queue', timeoutMs: 180000,
    })
    const lectureCommand = () => command('classroom.lecture', allParticipants, { text: lesson.lecture, durationMs: 7000 })
    const answerCommand = (id: string, question: string, answer: string) => command('classroom.answer', [{ entityId: 'teacher', role: 'teacher' }, { entityId: id, role: 'student' }], { question, answer })
    const nextStudent = students[(students.findIndex(s => s.id === studentId) + 1) % students.length].id
    const commands = kind === 'demo' ? [lectureCommand(), answerCommand(studentId, lesson.question, lesson.answer), answerCommand(nextStudent, lesson.nextQuestion, lesson.nextAnswer)]
      : kind === 'lecture' ? [lectureCommand()] : kind === 'answer' ? [answerCommand(studentId, lesson.question, lesson.answer)]
        : [command('classroom.settle', allParticipants, {})]
    const results = runtime.submitBatch({ mode: 'sequence', commands })
    const failure = results.find(result => result.error)
    if (failure?.error) setError(failure.error.message)
    setBusy(results.some(result => isPending(result.status)))
  }
  function stop() {
    const runtime = mounted.current?.runtime
    if (!runtime) return
    for (const record of runtime.snapshot().records.filter(r => r.command.type === 'activity.start' && isPending(r.status)).reverse()) {
      runtime.submit({ ...baseCommand(runtime), type: 'command.cancel', targetCommandId: record.command.commandId })
    }
    setBusy(false); setPhase('已停止'); setError('')
  }
  function changeLesson(id: string) {
    const next = lessons.find(l => l.id === id)!
    if (updateBoard(next.title, next.board)) setLessonId(id)
  }

  return <div className="classroom-app">
    <header className="classroom-header">
      <div className="classroom-brand"><GraduationCap size={25} /><strong>PixOffice</strong><span>教室</span></div>
      <nav aria-label="场景导航">
        {homeUrl && <a href={homeUrl}><ArrowLeft size={15} />项目首页</a>}
        {officeUrl && <a href={officeUrl}>办公室</a>}
        <span aria-current="page">教育场景</span>
      </nav>
      <span className="classroom-connection"><i />{ready ? gatewayUrl ? `外部驱动 · ${transportStatus}` : '场景就绪' : '场景准备中'}</span>
    </header>
    <main className="classroom-layout">
      <section className="classroom-teacher" aria-label="教师">
        <img src={`${assetBaseUrl}classroom-teacher/portrait.webp`} alt="顾老师" />
        <div><strong>顾老师的课堂</strong><p>教师 · 5 位学生</p></div><GraduationCap size={22} />
      </section>
      <section className="classroom-stats" aria-label="课堂概况">
        <div><span>本节课程</span><strong>{boardTitle}</strong></div>
        <div><span>到课学生</span><strong>5 <small>/ 5</small></strong></div>
        <div><span>完成活动</span><strong>{completed}</strong></div>
        <div><span>课堂状态</span><strong className="classroom-state"><i className={busy ? 'active' : ''} />{busy ? '进行中' : '就绪'}</strong></div>
      </section>
      <aside className="classroom-sidebar">
        <section className="classroom-course">
          <div className="classroom-section-title"><BookOpen size={17} /><h2>课程安排</h2><button type="button" onClick={() => { setDraftTitle(boardTitle); setDraftText(boardText); setBoardOpen(true) }} disabled={!ready || busy}>编辑黑板</button></div>
          <label className="classroom-sr" htmlFor="classroom-course">课程</label>
          <select id="classroom-course" value={lessonId} disabled={!ready || busy} onChange={e => changeLesson(e.target.value)}>{lessons.map(l => <option key={l.id} value={l.id}>{l.subject} · {l.title}</option>)}</select>
          <p className="classroom-question">{lesson.question}</p>
        </section>
        <section className="classroom-roster">
          <div className="classroom-section-title"><Users size={17} /><h2>班级成员</h2><span>5</span></div>
          {students.map(student => <button type="button" className={`classroom-student ${studentId === student.id ? 'selected' : ''}`} aria-pressed={studentId === student.id} key={student.id} onClick={() => setStudentId(student.id)}>
            <img src={`${assetBaseUrl}${student.appearanceId}/portrait.webp`} alt="" />
            <span><strong>{student.name}</strong><small>{actorStates[student.id] ?? '在座'}</small></span>
            {studentId === student.id ? <Check size={16} /> : <ChevronRight size={15} />}
          </button>)}
        </section>
        <section className="classroom-history">
          <div className="classroom-section-title"><MessageCircle size={17} /><h2>课堂记录</h2></div>
          <ol>{history.length ? history.map(entry => <li key={entry.id}><span>{entry.text}</span><time>{entry.time}</time></li>) : <li className="classroom-empty">还没有课堂活动</li>}</ol>
        </section>
      </aside>
      <section className="classroom-scene" aria-label="教室动画区域">
        <div className="classroom-scene-status" role="status"><span className={busy ? 'classroom-pulse' : ''} />{phase}</div>
        <div className="classroom-canvas" ref={host} />
        {speech && <div className="classroom-caption" role="status"><strong>{speech.name}</strong><span>{speech.text}</span></div>}
        {!ready && <div className="classroom-loading" role="status"><div>{error || loading}{error && <button type="button" onClick={() => window.location.reload()}>重新加载</button>}</div></div>}
        {error && ready && <div className="classroom-error" role="alert">{error}<button type="button" aria-label="关闭错误" onClick={() => setError('')}><X size={15} /></button></div>}
        <div className="classroom-controls">
          <button type="button" className="primary" disabled={!ready || busy} onClick={() => start('demo')}><Play size={17} />开始课堂演示</button>
          <button type="button" disabled={!ready || busy} onClick={() => start('lecture')}><BookOpen size={17} />讲课</button>
          <button type="button" disabled={!ready || busy} onClick={() => start('answer')}><MessageCircle size={17} />点名回答</button>
          <button type="button" title="返回座位" aria-label="返回座位" disabled={!ready || busy} onClick={() => start('settle')}><RotateCcw size={18} /></button>
          <button type="button" title="停止课堂活动" aria-label="停止课堂活动" disabled={!ready || !busy} onClick={stop}><Square size={17} /></button>
        </div>
      </section>
    </main>
    <dialog ref={dialog} className="classroom-board-dialog" onCancel={() => setBoardOpen(false)} onClose={() => setBoardOpen(false)}>
      <form onSubmit={event => { event.preventDefault(); if (updateBoard(draftTitle, draftText)) setBoardOpen(false) }}>
        <header><h2>课堂黑板</h2><button type="button" aria-label="关闭" onClick={() => setBoardOpen(false)}><X size={20} /></button></header>
        <label>课程标题<input maxLength={36} required value={draftTitle} onChange={e => setDraftTitle(e.target.value)} /></label>
        <label>板书内容<textarea rows={5} maxLength={180} value={draftText} onChange={e => setDraftText(e.target.value)} /></label>
        <footer><button type="submit" className="primary">更新黑板</button></footer>
      </form>
    </dialog>
  </div>
}
