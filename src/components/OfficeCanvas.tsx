import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { OfficeScene, type OfficeAgentClick, type SceneLoadProgress, type SceneActionProgress } from '@/scene/OfficeScene'
import type { Agent, AgentState } from '@/types/agent'
import { submitVisitAction } from '@/services/officeActionDispatcher'
import { isApartmentReady, usesApartmentCharacters } from '@/scene/assets/loadApartmentAssets'
import { APARTMENT_EMOTES } from '@/scene/characters/apartmentFrames'
import { CharacterPreview } from './CharacterPreview'
import { Grid2X2, Pause, Play, RotateCw, X } from 'lucide-react'
import type { OfficeRuntime } from '@/runtime/OfficeRuntime'
import { RoomEditor } from './map-editor/RoomEditor'
import { MapEditorOverlay } from './map-editor/MapEditorOverlay'
import { initialMapView } from './map-editor/commands'
import type { MapView, MapFurniture } from './map-editor/commands'


type AgentMenuState = {
  agent: Agent
  rosterNo: number
  x: number
  y: number
  agents: Agent[]
  pickingTarget: boolean
}

const STATE_ACTIONS: Array<{
  label: string
  state: AgentState
  task?: string
}> = [
  { label: '开始工作', state: 'working', task: '处理当前任务…' },
  { label: '进入思考', state: 'thinking', task: '思考下一步…' },
  { label: '暂时空闲', state: 'idle' },
]

const EMOTE_ACTIONS = [
  { label: '生气', animation: 'emotes/angry' },
  { label: '打嗝', animation: 'emotes/burp' },
  { label: '困惑', animation: 'emotes/confused' },
  { label: '哭泣', animation: 'emotes/crying' },
  { label: '倒下', animation: 'emotes/dead' },
  { label: '坚定', animation: 'emotes/determined' },
  { label: '凝视', animation: 'emotes/dramatic-stare' },
  { label: '兴奋', animation: 'emotes/excited' },
  { label: '撒娇', animation: 'emotes/fawning' },
  { label: '脸红', animation: 'emotes/flushed' },
  { label: '欢呼', animation: 'emotes/hooray' },
  { label: '灵感', animation: 'emotes/idea' },
  { label: '刚刚好', animation: 'emotes/just-right' },
  { label: '大笑', animation: 'emotes/laugh' },
  { label: '喜欢', animation: 'emotes/love' },
  { label: '害怕', animation: 'emotes/scared' },
  { label: '遮眼', animation: 'emotes/see-no-evil' },
  { label: '耸肩', animation: 'emotes/shrug' },
  { label: '闷闷不乐', animation: 'emotes/sulk' },
  { label: '冒汗', animation: 'emotes/sweat' },
  { label: '思考表情', animation: 'emotes/thinking' },
  { label: '吐舌', animation: 'emotes/tongue-out' },
  { label: '挥手', animation: 'emotes/wave' },
] as const

export function OfficeCanvas({ runtime, mapView, setMapView, covered = false }: { runtime: OfficeRuntime; mapView?: MapView; setMapView?: Dispatch<SetStateAction<MapView>>; covered?: boolean }) {
  useSyncExternalStore(runtime.subscribe, runtime.getRevision)
  const [localView, setLocalView] = useState(initialMapView)
  const hostRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<OfficeScene | null>(null)
  const readyRef = useRef(false)
  const [menu, setMenu] = useState<AgentMenuState | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [demo, setDemo] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [progress, setProgress] = useState<SceneLoadProgress>({ completed: 0, total: 0 })
  const [actions, setActions] = useState<SceneActionProgress>({ completed: 0, total: 0, ready: false })
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const editorRuntime = runtime
  const editor = runtime.editorSnapshot()
  const previewProp = useCallback((value?: MapFurniture) => sceneRef.current?.previewProp(value), [])
  const highlightProp = useCallback((id: string, valid: boolean) => sceneRef.current?.highlightProp(id, valid), [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const handleAgentClick = (event: OfficeAgentClick) => {
      const rect = host.getBoundingClientRect()
      const menuWidth = 260
      const menuHeight = Math.min(520, rect.height - 24)
      setMenu({
        agent: event.agent,
        rosterNo: event.rosterNo,
        x: Math.max(12, Math.min(event.clientX - rect.left, rect.width - menuWidth - 12)),
        y: Math.max(12, Math.min(event.clientY - rect.top, rect.height - menuHeight - 12)),
        agents: sceneRef.current?.getAgents() ?? [],
        pickingTarget: false,
      })
    }

    let active = true
    const scene = new OfficeScene({ runtime, onAgentClick: handleAgentClick, onDraftChange: setNotice, onDemoChange: setDemo,
      onLoadProgress: value => { if (active) setProgress(value) },
      onActionProgress: value => { if (active) setActions(value) } })
    sceneRef.current = scene

    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      if (width <= 0 || height <= 0) return

      if (!readyRef.current) {
        readyRef.current = true
        setLoaded(false)
        setProgress({ completed: 0, total: 0 })
        setActions({ completed: 0, total: 0, ready: false })
        void scene.init(host, width, height).then(async () => {
          if (!active) return
          setLoaded(true); setDemo(scene.isDemoRunning)
          const previews: Record<string, string> = {}
          for (const template of runtime.templates()) {
            if (!active) return
            previews[template.id] = await scene.furnitureThumbnail(template.id)
          }
          if (active) setThumbnails(previews)
        }).catch((error) => {
          console.error('[Office] 场景初始化失败', error)
          if (active) setNotice(String(error))
        })
        return
      }

      sceneRef.current?.resize(width, height)
    })

    ro.observe(surfaceRef.current!)

    return () => {
      active = false
      ro.disconnect()
      readyRef.current = false
      scene.destroy()
      sceneRef.current = null
    }
  }, [runtime])

  useEffect(() => {
    sceneRef.current?.setRenderingSuspended(previewOpen || covered)
  }, [previewOpen, covered, loaded, runtime])

  useEffect(() => {
    const close = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('.agent-action-menu')) {
        return
      }
      setMenu(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }

    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const applyState = (state: AgentState, task?: string) => {
    if (!menu) return
    sceneRef.current?.setAgentState(menu.agent.id, state, task)
    setMenu(null)
  }

  const playEmote = (animation: string) => {
    if (!menu) return
    const result = sceneRef.current?.playAgentAnimation(menu.agent.id, animation)
    if (result?.error) setNotice(result.error.message)
    setMenu(null)
  }

  const startInteraction = (targetRosterNo: number, targetName: string) => {
    if (!menu || targetRosterNo === menu.rosterNo) return
    submitVisitAction(
      {
        type: 'desk_visit',
        visitor: menu.rosterNo,
        host: targetRosterNo,
        message: `${targetName}，我来和你同步一下。`,
      },
      { queueIfBusy: true },
    )
    setMenu(null)
  }

  const edit = () => {
    try { sceneRef.current?.beginEditing(); (setMapView ?? setLocalView)(initialMapView); setDemo(false); setMenu(null); setNotice(null) }
    catch (error) { setNotice(error instanceof Error ? error.message : '暂时无法编辑') }
  }
  const toggleDemo = () => {
    try { sceneRef.current?.setDemo(!demo); setNotice(null) }
    catch (error) { setNotice(error instanceof Error ? error.message : '演示启动失败') }
  }

  return (
    <div ref={hostRef} className={`office-canvas ${editor ? 'is-decorating' : ''} ${(mapView ?? localView).catalogOpen ? '' : 'catalog-closed'}`}>
      <div ref={surfaceRef} className="office-render-surface" aria-hidden="true" />
      {!loaded && !notice && <div className="office-loading" role="status" aria-live="polite">
        <span>正在加载办公室{progress.total > 0 ? ` · ${progress.completed}/${progress.total}` : '…'}</span>
        {progress.total > 0 && <progress aria-label="办公室资源加载进度" value={progress.completed} max={progress.total} />}
      </div>}
      {editor && editorRuntime ? <>
        <MapEditorOverlay runtime={editorRuntime} draft={editor} view={mapView ?? localView} setView={setMapView ?? setLocalView} onError={setNotice} onPreview={previewProp} onHighlight={highlightProp} />
        <RoomEditor key={editor.id} runtime={editorRuntime} draft={editor} view={mapView ?? localView} setView={setMapView ?? setLocalView} onError={setNotice} thumbnails={thumbnails} />
      </> : <div className="runtime-scene-toolbar">
          <button type="button" title="编辑布局" aria-label="编辑布局" disabled={!loaded || !actions.ready} onClick={edit}><Grid2X2 size={17} /></button>
          <button type="button" title={demo ? '停止演示' : '开始演示'} aria-label={demo ? '停止演示' : '开始演示'} disabled={!loaded || !actions.ready} onClick={toggleDemo}>{demo ? <Pause size={17} /> : <Play size={17} />}</button>
          {loaded && !actions.ready && <span role="status" title={actions.error}>{actions.error ? '互动动作加载失败' : `准备互动动作 · ${actions.completed}/${actions.total}`}</span>}
          {loaded && actions.error && <button type="button" title="重试加载互动动作" aria-label="重试加载互动动作" onClick={() => { void sceneRef.current?.prepareActions() }}><RotateCw size={16} /></button>}
          {demo && <span>演示中</span>}
      </div>}
      {notice && <div className="runtime-scene-notice" role="alert">{notice}<button type="button" aria-label="关闭提示" onClick={() => setNotice(null)}><X size={14} /></button></div>}
      <button className="character-preview-trigger" type="button" disabled={!loaded || !actions.ready} onClick={() => setPreviewOpen(true)}>人物预览</button>
      {previewOpen && <CharacterPreview onClose={() => setPreviewOpen(false)} />}
      {menu && !editor && (
        <div
          className="agent-action-menu"
          style={{ left: menu.x, top: menu.y }}
        >
          <div className="agent-action-head">
            <span className="agent-action-name">{menu.agent.name}</span>
            <span className="agent-action-state">{menu.agent.state}</span>
          </div>

          {!menu.pickingTarget ? (
            <>
              <div className="agent-action-group">
                <div className="agent-action-section-title">互动</div>
                <button
                  type="button"
                  className="agent-action-btn"
                  onClick={() =>
                    setMenu((current) =>
                      current ? { ...current, pickingTarget: true } : current,
                    )
                  }
                >
                  互动…
                </button>
              </div>

              <div className="agent-action-group">
                <div className="agent-action-section-title">状态</div>
                {STATE_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    className="agent-action-btn"
                    onClick={() => applyState(action.state, action.task)}
                  >
                    {action.label}
                  </button>
                ))}
              </div>

              <div className="agent-action-group">
                <div className="agent-action-section-title">表情动作</div>
                <div className="agent-emote-grid">
                  {(usesApartmentCharacters() && isApartmentReady(menu.agent.appearanceId ?? menu.agent.id) ? APARTMENT_EMOTES : EMOTE_ACTIONS).map((action) => (
                    <button
                      key={action.animation}
                      type="button"
                      className="agent-action-chip"
                      onClick={() => playEmote(action.animation)}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="agent-action-group">
              <div className="agent-action-section-title">选择互动对象</div>
              <button
                type="button"
                className="agent-action-btn subtle"
                onClick={() =>
                  setMenu((current) =>
                    current ? { ...current, pickingTarget: false } : current,
                  )
                }
              >
                返回动作
              </button>
              {menu.agents
                .map((agent, index) => ({ agent, rosterNo: index + 1 }))
                .filter(({ agent }) => agent.id !== menu.agent.id)
                .map(({ agent, rosterNo }) => (
                  <button
                    key={agent.id}
                    type="button"
                    className="agent-action-btn"
                    onClick={() => startInteraction(rosterNo, agent.name)}
                  >
                    和 {agent.name} 互动
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
