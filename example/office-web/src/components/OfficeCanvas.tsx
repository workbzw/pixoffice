import { useMemo, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { OfficeSceneController } from '../controller/useOfficeSceneController.ts'
import { SceneSurface } from '../../../shared/scene/SceneSurface.tsx'
import './OfficeCanvas.css'
import { WhiteboardReader } from './WhiteboardReader.tsx'
import type { DashboardSnapshot } from '@pixoffice/protocol/dashboard'
import { ActorInsightPopover } from './insights/ActorInsightPopover.tsx'

export function OfficeCanvas({ controller, editing = false, catalogOpen = false, children, dashboard, example = false, actors = [], canShowActions = true }: {
  controller: OfficeSceneController; editing?: boolean; catalogOpen?: boolean; children?: ReactNode
  dashboard?: DashboardSnapshot | null; example?: boolean; actors?: { id: string; name: string; templateId: string }[]
  canShowActions?: boolean
}) {
  const { host, loaded, notice, setNotice, progress } = controller
  const found = actors.find(actor => actor.id === controller.insight?.actorId)
  const actorId = found?.id, actorName = found?.name ?? '', appearanceId = found?.templateId ?? ''
  // Keep historical charts independent of the moving actor's per-frame position.
  const selected = useMemo(() => actorId ? { id: actorId, name: actorName, templateId: appearanceId } : undefined,
    [actorId, actorName, appearanceId])
  return <div className={`office-canvas ${editing ? 'is-decorating' : ''} ${catalogOpen ? '' : 'catalog-closed'}`}>
    <SceneSurface host={host} className="office-render-surface" />
    {!loaded && !notice && <div className="office-loading" role="status" aria-live="polite">
      <span>正在加载办公室{progress.total > 0 ? ` · ${progress.completed}/${progress.total}` : '…'}</span>
      {progress.total > 0 && <progress aria-label="办公室资源加载进度" value={progress.completed} max={progress.total} />}
    </div>}
      {notice && <div className="runtime-scene-notice" role="alert">{notice}<button type="button" aria-label="关闭提示" onClick={() => setNotice(null)}><X size={14} /></button></div>}
    {children}
    {controller.actorInsightsEnabled && !editing && loaded && <div className="agent-insight-access" aria-label="人物统计">{actors.map(actor => <button type="button" key={actor.id} onClick={() => {
      const anchor = controller.sceneRef.current?.actorClientAnchor(actor.id)
      if (anchor) controller.insightInteraction.open({ actorId: actor.id, ...anchor })
    }}>查看{actor.name}统计</button>)}</div>}
    {controller.actorInsightsEnabled && !editing && !controller.whiteboard && selected && controller.insight && <ActorInsightPopover
      key={`${dashboard?.workspace.id ?? ''}:${dashboard?.conversationId ?? ''}:${selected.id}`} selection={controller.insight} interaction={controller.insightInteraction}
      dashboard={dashboard} actor={selected} example={example} onActions={canShowActions ? controller.showAgentActions : undefined} />}
    {!editing && controller.whiteboard && <WhiteboardReader boardId={controller.whiteboard.id} state={controller.whiteboard.state} progress={controller.whiteboardProgress} onClose={controller.closeWhiteboard} />}
  </div>
}
