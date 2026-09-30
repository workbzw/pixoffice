import { useEffect, useRef, useState } from 'react'
import { Armchair, Play, ScanEye } from 'lucide-react'
import { CharacterPreview } from '@/components/CharacterPreview'
import { acquireCharacterPacks, supportsCharacterPose } from '@/scene/assets/loadApartmentAssets'
import { OfficeScene } from '@/scene/OfficeScene'
import { seatStepDurationMs } from '@/scene/gridProjection'
import { OfficeRuntime } from '@/runtime/OfficeRuntime'
import { builtinPlugins, createOfficeWorld } from '@/runtime/builtin/officePack'
import { GridNavigation } from '@/runtime/navigation'
import './CharacterLab.css'

export function CharacterLab({ id, label }: { id: string; label: string }) {
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<OfficeScene | null>(null)
  const [preview, setPreview] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const element = host.current!
    const world = createOfficeWorld('character-lab')
    for (const actor of world.actors) {
      actor.templateId = id
      actor.presentation = { status: 'working', title: '工作动作验收', sourceRevision: 0 }
    }
    // No persistence, business adapter or HTTP command connection in the lab.
    const runtime = new OfficeRuntime({ world, plugins: builtinPlugins, createNavigation: templates => new GridNavigation(templates),
      supportsPose: supportsCharacterPose, seatStepDuration: seatStepDurationMs })
    const current = new OfficeScene({ runtime })
    scene.current = current
    let active = true
    setReady(false); setError('')
    void acquireCharacterPacks([id]).then(async lease => {
      try {
        if (!active) return
        // A broken candidate must fail visibly, never fall back to a different character.
        await current.init(element, element.clientWidth, element.clientHeight)
        if (active) setReady(true)
      } finally { lease.release() }
    }).catch(reason => { if (active) setError(String(reason)) })
    const observer = new ResizeObserver(() => current.resize(element.clientWidth, element.clientHeight))
    observer.observe(element)
    return () => { active = false; observer.disconnect(); current.destroy(); runtime.dispose(); scene.current = null }
  }, [id, revision])
  useEffect(() => { scene.current?.setRenderingSuspended(preview) }, [preview, ready])
  return <main className="character-lab">
    <header>
      <div><strong>{label}</strong><span>候选素材 · 未验收</span></div>
      <nav aria-label="验收场景">
        <button disabled={!ready} onClick={() => setPreview(true)}><ScanEye size={16} />动作逐帧</button>
        <button disabled={!ready} onClick={() => scene.current?.setDemo(true)}><Play size={16} />走动与交谈</button>
        <button disabled={!ready} onClick={() => setRevision(value => value + 1)}><Armchair size={16} />重置工位</button>
      </nav>
    </header>
    {error && <p role="alert">{error}</p>}
    <div className="character-lab-scene" ref={host} />
    {preview && <CharacterPreview onClose={() => setPreview(false)} />}
  </main>
}
