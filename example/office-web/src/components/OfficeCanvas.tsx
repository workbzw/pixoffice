import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import type { OfficeSceneController } from '../controller/useOfficeSceneController.ts'
import { SceneSurface } from '../../../shared/scene/SceneSurface.tsx'
import './OfficeCanvas.css'
import { WhiteboardReader } from './WhiteboardReader.tsx'

export function OfficeCanvas({ controller, editing = false, catalogOpen = false, children }: {
  controller: OfficeSceneController; editing?: boolean; catalogOpen?: boolean; children?: ReactNode
}) {
  const { host, loaded, notice, setNotice, progress } = controller
  return <div className={`office-canvas ${editing ? 'is-decorating' : ''} ${catalogOpen ? '' : 'catalog-closed'}`}>
    <SceneSurface host={host} className="office-render-surface" />
    {!loaded && !notice && <div className="office-loading" role="status" aria-live="polite">
      <span>正在加载办公室{progress.total > 0 ? ` · ${progress.completed}/${progress.total}` : '…'}</span>
      {progress.total > 0 && <progress aria-label="办公室资源加载进度" value={progress.completed} max={progress.total} />}
    </div>}
      {notice && <div className="runtime-scene-notice" role="alert">{notice}<button type="button" aria-label="关闭提示" onClick={() => setNotice(null)}><X size={14} /></button></div>}
    {children}
    {!editing && controller.whiteboard && <WhiteboardReader boardId={controller.whiteboard.id} state={controller.whiteboard.state} progress={controller.whiteboardProgress} onClose={controller.closeWhiteboard} />}
  </div>
}
