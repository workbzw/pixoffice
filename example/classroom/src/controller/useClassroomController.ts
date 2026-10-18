import { useEffect, useRef, useState } from 'react'
import { mountScene } from '@pixoffice/renderer-pixi'
import type { SceneRuntime } from '@pixoffice/runtime'
import type { SceneCommand } from '@pixoffice/protocol'
import { connectSceneRelay } from '@pixoffice/runtime/adapters/sse'
import { classroomRoster } from '@pixoffice/scene-classroom'
import { lessons } from '../lessons.ts'
import { SceneHost } from '../../../shared/scene/SceneHost.ts'

type Mounted = Awaited<ReturnType<typeof mountScene>>
type Entry = { id: string; text: string; time: string }
const students = classroomRoster.filter(p => p.role === 'student')
const allParticipants = classroomRoster.map(p => ({ entityId: p.id, role: p.role }))
const baseCommand = (runtime: SceneRuntime) => ({ protocolVersion: '2.0' as const, sceneId: runtime.sceneId, commandId: crypto.randomUUID() })
const isPending = (status: string) => status === 'running' || status === 'queued'
export function useClassroomController({ assetBaseUrl, relayUrl }: { assetBaseUrl: string; relayUrl?: string }) {
  const [host] = useState(() => new SceneHost())
  const mounted = useRef<Mounted | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [ready, setReady] = useState(false), [loading, setLoading] = useState('正在准备教室…'), [error, setError] = useState('')
  const [transportStatus, setTransportStatus] = useState('未连接')
  const [lessonId, setLessonId] = useState<string>('solar'), [studentId, setStudentId] = useState<string>('student-1')
  const [phase, setPhase] = useState('等待上课'), [busy, setBusy] = useState(false), [completed, setCompleted] = useState(0)
  const [actorStates, setActorStates] = useState<Record<string, string>>({}), [history, setHistory] = useState<Entry[]>([])
  const [speech, setSpeech] = useState<{ name: string; text: string } | null>(null)
  const [boardTitle, setBoardTitle] = useState<string>(lessons[0].title), [boardText, setBoardText] = useState<string>(lessons[0].board)
  const lastPhase = useRef(''), lastError = useRef(''), actionReady = useRef(false)
  const lesson = lessons.find(l => l.id === lessonId) ?? lessons[0]

  useEffect(() => {
    const controller = new AbortController()
    let scene: Mounted | undefined, disconnect: (() => void) | undefined, timer: ReturnType<typeof setInterval> | undefined
    setLoaded(false); setReady(false); setError(''); setLoading('正在准备教室…'); actionReady.current = false
    const connectRelay = () => {
      if (relayUrl && scene?.view.areActionsReady && !disconnect && !controller.signal.aborted) {
        disconnect = connectSceneRelay(scene.runtime, relayUrl, setTransportStatus)
      }
    }
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
      setCompleted(runtime.completedActivityCount)
      const key = current ? `${current.activityId}:${current.phaseIndex}` : ''
      if (key && key !== lastPhase.current) {
        lastPhase.current = key
        setHistory(previous => [{ id: key, text: title, time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }, ...previous].slice(0, 30))
      } else if (!key) lastPhase.current = ''
      const failed = [...snapshot.records].reverse().find(r => ['failed', 'rejected', 'expired'].includes(r.status))
      if (failed?.error && lastError.current !== failed.command.commandId) { lastError.current = failed.command.commandId; setError(failed.error.message) }
    }
    void mountScene(host.element, async signal => {
      const { createClassroomAssembly } = await import('../assembly.ts')
      return createClassroomAssembly(assetBaseUrl, signal)
    }, { signal: controller.signal, view: {
      onActorClick: ({ actorId }) => { if (students.some(s => s.id === actorId)) setStudentId(actorId) },
      onLoadProgress: p => { if (!controller.signal.aborted) setLoading(`正在准备教室 ${p.completed}/${p.total}`) },
      onActionProgress: p => {
        if (controller.signal.aborted) return
        actionReady.current = p.ready
        setReady(p.ready && Boolean(mounted.current))
        setLoading(p.error ?? `正在准备动作 ${p.completed}/${p.total}`)
        if (p.error) {
          console.warn('[Classroom] 互动动作加载失败', p.error)
          setError('互动动作加载失败，请检查网络后重试。')
        }
        if (p.ready) connectRelay()
      },
    } }).then(result => {
      if (controller.signal.aborted) { result.dispose(); return }
      scene = result; mounted.current = result; setLoaded(true); setReady(actionReady.current || result.view.areActionsReady)
      refresh(); timer = setInterval(refresh, 250)
      connectRelay()
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { disconnect?.(); controller.abort(); clearInterval(timer); mounted.current = null; actionReady.current = false }
  }, [assetBaseUrl, relayUrl, host])

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
  function retryActions() {
    setError('')
    void mounted.current?.view.prepareActions()
  }
  function changeLesson(id: string) {
    const next = lessons.find(l => l.id === id)!
    if (updateBoard(next.title, next.board)) setLessonId(id)
  }

  return { host, loaded, ready, loading, error, setError, transportStatus, lessonId, studentId, setStudentId, phase,
    busy, completed, actorStates, history, speech, boardTitle, boardText, lesson, updateBoard, start, stop, retryActions, changeLesson }
}
export type ClassroomController = ReturnType<typeof useClassroomController>
