import '../farm.css'
import './FarmScene.css'
import type { ReactNode } from 'react'
import { LoaderCircle, RotateCcw, X } from 'lucide-react'
import type { FarmController } from '../controller/useFarmController.ts'
import { SceneSurface } from '../../../shared/scene/SceneSurface.tsx'

export function FarmScene({ controller, children }: { controller: FarmController; children?: ReactNode }) {
  const { host, loaded, ready, error, loading, retryActions, setError } = controller
  return <section className="farm-scene" aria-label="农场动画区域" aria-busy={!loaded}>
    <SceneSurface host={host} className="farm-canvas" />
        {!loaded && <div className="farm-loading" role="status"><LoaderCircle size={24} />{error || loading}</div>}
        {loaded && !ready && <div className="farm-actions-loading">{error ? <button type="button" onClick={retryActions}><RotateCcw size={14} />重试动作</button> : <><LoaderCircle size={14} />{loading}</>}</div>}
        {error && <div className="farm-error" role="alert"><span>{error}</span><button type="button" aria-label="关闭错误" onClick={() => setError('')}><X size={15} /></button></div>}
    {children}
  </section>
}
