import '../classroom.css'
import './ClassroomScene.css'
import type { ReactNode } from 'react'
import { LoaderCircle, RotateCcw, X } from 'lucide-react'
import type { ClassroomController } from '../controller/useClassroomController.ts'
import { SceneSurface } from '../../../shared/scene/SceneSurface.tsx'

export function ClassroomScene({ controller, children }: { controller: ClassroomController; children?: ReactNode }) {
  const { host, loaded, ready, speech, error, loading, retryActions, setError } = controller
  return <section className="classroom-scene" aria-label="教室动画区域" aria-busy={!loaded}>
    <SceneSurface host={host} className="classroom-canvas" />
        {speech && <div className="classroom-caption" role="status"><strong>{speech.name}</strong><span>{speech.text}</span></div>}
        {!loaded && <div className="classroom-loading" role="status"><div>{error || loading}{error && <button type="button" onClick={() => window.location.reload()}>重新加载</button>}</div></div>}
        {loaded && !ready && !error && <div className="classroom-action-loading" role="status"><LoaderCircle size={14} />{loading}</div>}
        {error && loaded && <div className="classroom-error" role="alert"><span>{error}</span>{!ready
          ? <button type="button" onClick={retryActions}><RotateCcw size={16} />重试动作</button>
          : <button type="button" aria-label="关闭错误" onClick={() => setError('')}><X size={15} /></button>}</div>}
    {children}
  </section>
}
