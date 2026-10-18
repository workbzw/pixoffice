import '../classroom.css'
import './ClassroomShell.css'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, BookOpen, Check, ChevronRight, GraduationCap, Maximize, MessageCircle, Minimize, Play, RotateCcw, Square, Users, X } from 'lucide-react'
import { classroomRoster } from '@pixoffice/scene-classroom'
import { lessons } from '../lessons.ts'
import { createClassroomFocus } from '../focusMode.ts'
import type { ClassroomController } from '../controller/useClassroomController.ts'
import type { SceneSlot } from '../../../shared/scene/layout.tsx'

const students = classroomRoster.filter(p => p.role === 'student')
export interface ClassroomShellProps {
  controller: ClassroomController
  scene: SceneSlot
  assetBaseUrl: string
  homeUrl?: string
  officeUrl?: string
  relayUrl?: string
}
export function ClassroomShell({ controller, scene, assetBaseUrl, homeUrl, officeUrl, relayUrl }: ClassroomShellProps) {
  const { ready, loaded, transportStatus, boardTitle, boardText, completed, busy, lessonId, lesson, studentId,
    setStudentId, actorStates, history, phase, updateBoard, start, stop, changeLesson } = controller
  const app = useRef<HTMLDivElement>(null), focusButton = useRef<HTMLButtonElement>(null)
  const focusMode = useRef<ReturnType<typeof createClassroomFocus> | null>(null), wasFocused = useRef(false)
  const [focused, setFocused] = useState(false)
  const [boardOpen, setBoardOpen] = useState(false)
  const [draftTitle, setDraftTitle] = useState(''), [draftText, setDraftText] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const mode = createClassroomFocus(app.current!, setFocused)
    focusMode.current = mode
    return () => { mode.dispose(); focusMode.current = null }
  }, [])
  useEffect(() => {
    if (focused || wasFocused.current) focusButton.current?.focus({ preventScroll: true })
    wasFocused.current = focused
  }, [focused])

  useEffect(() => { if (boardOpen) dialog.current?.showModal(); else dialog.current?.close() }, [boardOpen])

  return <div className={`classroom-app${focused ? ' classroom-focused' : ''}`} ref={app}>
    <header className="classroom-header">
      <div className="classroom-brand"><GraduationCap size={25} /><strong>PixOffice</strong><span>教室</span></div>
      <nav aria-label="场景导航">
        {homeUrl && <a href={homeUrl}><ArrowLeft size={15} />项目首页</a>}
        {officeUrl && <a href={officeUrl}>办公室</a>}
        <span aria-current="page">教育场景</span>
      </nav>
      <span className="classroom-connection"><i />{ready ? relayUrl ? `外部驱动 · ${transportStatus}` : '场景就绪' : loaded ? '动作准备中' : '场景准备中'}</span>
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
          <div className="classroom-section-title"><BookOpen size={17} /><h2>课程安排</h2><button type="button" onClick={() => { setDraftTitle(boardTitle); setDraftText(boardText); setBoardOpen(true) }} disabled={!loaded || busy}>编辑黑板</button></div>
          <label className="classroom-sr" htmlFor="classroom-course">课程</label>
          <select id="classroom-course" value={lessonId} disabled={!loaded || busy} onChange={e => changeLesson(e.target.value)}>{lessons.map(l => <option key={l.id} value={l.id}>{l.subject} · {l.title}</option>)}</select>
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
      {scene(<>
        <button type="button" className="classroom-focus-toggle" ref={focusButton} aria-pressed={focused}
          title={focused ? '退出专注课堂 (Esc)' : '专注课堂'} onClick={() => focused ? focusMode.current?.exit() : focusMode.current?.enter()}>
          {focused ? <Minimize size={17} /> : <Maximize size={17} />}{focused ? '退出专注' : '专注课堂'}
        </button>
        <div className="classroom-scene-status" role="status"><span className={busy ? 'classroom-pulse' : ''} />{phase}</div>
        <div className="classroom-controls" role="group" aria-label="课堂操作">
          {focused ? <button type="button" className="primary" disabled={!ready} onClick={() => busy ? stop() : start('demo')}>
            {busy ? <Square size={17} /> : <Play size={17} />}{busy ? '停止课堂' : '开始上课'}
          </button> : <>
          <button type="button" className="primary" disabled={!ready || busy} onClick={() => start('demo')}><Play size={17} />开始课堂演示</button>
          <button type="button" disabled={!ready || busy} onClick={() => start('lecture')}><BookOpen size={17} />讲课</button>
          <button type="button" disabled={!ready || busy} onClick={() => start('answer')}><MessageCircle size={17} />点名回答</button>
          <button type="button" title="返回座位" aria-label="返回座位" disabled={!ready || busy} onClick={() => start('settle')}><RotateCcw size={18} /></button>
          <button type="button" title="停止课堂活动" aria-label="停止课堂活动" disabled={!ready || !busy} onClick={stop}><Square size={17} /></button>
          </>}
        </div>
      </>)}
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
