import { createSceneRuntime } from '@pixoffice/runtime'
import type { ScenePack, CreateSceneRuntimeOptions } from '@pixoffice/runtime'
import { visualAssetManifestSchema } from '@pixoffice/contracts'
import type { VisualAssetManifest } from '@pixoffice/contracts'
import { SceneView } from './SceneView.ts'
import type { SceneViewOptions } from './SceneView.ts'

export interface SceneAssembly extends Pick<SceneViewOptions, 'pack' | 'animations' | 'resolveAppearance'> {
  scene: ScenePack
}
export interface MountSceneOptions {
  signal?: AbortSignal
  runtime?: CreateSceneRuntimeOptions
  view?: Omit<SceneViewOptions, 'runtime' | 'pack' | 'animations' | 'resolveAppearance' | 'onStep' | 'dispatchCommand'>
}

/** The host selects a trusted module. Unselected scenes are never imported. */
export async function mountScene(host: HTMLElement, load: (signal: AbortSignal) => Promise<SceneAssembly>, options: MountSceneOptions = {}) {
  const signal = options.signal ?? new AbortController().signal
  signal.throwIfAborted()
  const assembly = await load(signal)
  signal.throwIfAborted()
  const runtime = createSceneRuntime(assembly.scene, options.runtime)
  let view: SceneView | undefined, observer: ResizeObserver | undefined, disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    signal.removeEventListener('abort', dispose)
    observer?.disconnect()
    try { view?.destroy() } finally { runtime.dispose() }
  }
  signal.addEventListener('abort', dispose, { once: true })
  try {
    view = new SceneView({ ...options.view, ...assembly, runtime,
      onStep: elapsed => runtime.tick(elapsed), dispatchCommand: command => runtime.submit(command) })
    await view.init(host, Math.max(1, host.clientWidth), Math.max(1, host.clientHeight))
    signal.throwIfAborted()
    const mountedView = view
    observer = new ResizeObserver(() => mountedView.resize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight)))
    observer.observe(host)
    return { runtime, view, dispose }
  } catch (error) { dispose(); throw error }
}

/** URLs are host-owned, not guessed from a scene name or a global registry. */
export function createAppearanceResolver(urlForId: (id: string) => string, signal?: AbortSignal) {
  const cache = new Map<string, Promise<VisualAssetManifest>>()
  return (id: string): Promise<VisualAssetManifest> => {
    const cached = cache.get(id)
    if (cached) return cached
    const result = (async () => {
      const url = urlForId(id)
      const response = await fetch(url, { signal })
      if (!response.ok) throw new Error(`Appearance ${id}: HTTP ${response.status}`)
      const manifest = visualAssetManifestSchema.parse(await response.json())
      manifest.source.uri = new URL(manifest.source.uri, response.url || url).href
      return manifest
    })().catch(error => { cache.delete(id); throw error })
    cache.set(id, result)
    return result
  }
}
