import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Ref } from 'react'
import { ArrowUp, Clapperboard, Grid2X2, MessageCircle, Play } from 'lucide-react'
import type { OfficeLayoutId } from '@pixoffice/protocol/office-integration'
import type { OfficeTeamSession } from '../application/OfficeTeamSession.ts'
import { MemberOfficeShell } from '../ui/MemberOfficeShell.tsx'
import { RoundedOfficeShell } from '../ui/RoundedOfficeShell.tsx'
import { OfficeShell } from '../ui/OfficeShell.tsx'
import { OfficePreviewPool } from './OfficePreviewPool.ts'
import type { PreviewState } from './OfficePreviewPool.ts'

const noop = () => {}
const noAction = async () => {}

export function OfficeLivePreview({ session, pool, layoutId = 'members', viewport }: {
  session: OfficeTeamSession; pool: OfficePreviewPool; layoutId?: OfficeLayoutId; viewport: { width: number; height: number }
}) {
  const root = useRef<HTMLDivElement>(null)
  const page = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<PreviewState>('loading')
  const [visible, setVisible] = useState(false)
  useLayoutEffect(() => {
    const container = root.current, surface = page.current
    if (!container || !surface) return
    const fit = () => { surface.style.setProperty('--preview-scale', String(Math.min(container.clientWidth / viewport.width, container.clientHeight / viewport.height))) }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(container)
    return () => observer.disconnect()
  }, [viewport.width, viewport.height])
  useEffect(() => {
    const container = root.current
    if (!container) return
    const observer = new IntersectionObserver(entries => setVisible(entries[0].isIntersecting))
    observer.observe(container)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (visible && canvas.current) return pool.watch(session.runtime.sceneId, session, canvas.current, setState)
  }, [pool, session, visible])
  return <div ref={root} className="dispatch-live-preview" data-preview-state={state} aria-hidden="true" inert>
    <div ref={page} className="dispatch-live-page" style={{ width: viewport.width, height: viewport.height }}>
      {visible && <OfficePreviewPage session={session} layoutId={layoutId} canvasRef={canvas} />}
    </div>
    {state !== 'ready' && <span className="dispatch-preview-loading">{state === 'error' ? '预览暂不可用' : '正在加载预览…'}</span>}
  </div>
}

export function OfficePreviewPage({ session, layoutId = 'members', canvasRef }: { session: OfficeTeamSession; layoutId?: OfficeLayoutId; canvasRef?: Ref<HTMLCanvasElement> }) {
  const { dashboard, connection } = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  const chat = useSyncExternalStore(session.chat.subscribe, session.chat.getSnapshot, session.chat.getSnapshot)
  const conversation = chat.conversations.find(item => item.id === chat.selectedId)
  const appearanceIds = Object.fromEntries(session.runtime.readActors().map(actor => [actor.id, actor.templateId]))
  const Shell = layoutId === 'classic' ? OfficeShell : layoutId === 'rounded' ? RoundedOfficeShell : MemberOfficeShell
  return <Shell connection={connection} dashboard={dashboard} dashboardError={null} sceneLinkError={null} dataMode={session.source.kind}
        appearanceIds={appearanceIds} executeAction={noAction} canExecuteActions={false} pendingTaskIds={[]} actionError={null} editing={false}
        sceneAspectRatio={1100 / 950} canRecoverLayout={false} recoverLayout={noop} exportCapabilities={noop} exportSnapshot={noop} renderScenePanel={() => undefined}
        scene={<main className="office-main office-main-reference"><div className="office-stage"><div className="office-canvas"><div className="office-render-surface"><canvas ref={canvasRef} className="dispatch-live-canvas" /></div>
          <div className="dispatch-preview-toolbar"><Grid2X2 size={18} /><Clapperboard size={18} /><Play size={18} /></div>
        </div></div><div className="office-chat" data-expanded="false"><div className="office-chat-composer"><span className="office-chat-history is-session"><MessageCircle size={15} /><span>{conversation?.title ?? dashboard?.workspace.name ?? ''}</span></span><span className="dispatch-preview-placeholder">和办公室聊一聊…</span><span className="office-chat-send"><ArrowUp size={21} /></span></div></div></main>} />
}
