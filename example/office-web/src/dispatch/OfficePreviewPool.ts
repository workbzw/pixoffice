import { Application } from 'pixi.js'
import type { OfficeTeamSession } from '../application/OfficeTeamSession.ts'
import { OfficeScene } from '../application/OfficeScene.ts'
import { officeActorTasks } from '../dashboard/actorTasks.ts'

export type PreviewState = 'loading' | 'ready' | 'error'
type Target = { canvas: HTMLCanvasElement; state: (value: PreviewState) => void }
type Preview = { session: OfficeTeamSession; targets: Set<Target>; scene?: OfficeScene; signature: string; sampledAt: number; frame: number }
type CachedFrame = { session: OfficeTeamSession; canvas: HTMLCanvasElement; frame: number }

/** One low-resolution WebGL context; visible tiles receive inexpensive 2D copies. */
export class OfficePreviewPool {
  private previews = new Map<string, Preview>()
  private cache = new Map<string, CachedFrame>()
  private application?: Promise<Application>
  private timer?: ReturnType<typeof setTimeout>
  private generation = 0
  private sampling = false
  private samplingTask?: Promise<void>

  watch(id: string, session: OfficeTeamSession, canvas: HTMLCanvasElement, state: Target['state']) {
    let preview = this.previews.get(id)
    if (preview && preview.session !== session) { preview.scene?.destroy(); this.previews.delete(id); preview = undefined }
    if (!preview) {
      preview = { session, targets: new Set(), signature: '', sampledAt: 0, frame: this.cache.get(id)?.session === session ? this.cache.get(id)!.frame : 0 }
      this.previews.set(id, preview)
    }
    const target = { canvas, state }
    preview.targets.add(target)
    canvas.dataset.teamId = id
    const cached = this.cache.get(id)
    if (cached?.session === session) { this.copy(cached.canvas, target, cached.frame); state('ready') }
    else state('loading')
    this.schedule(0)
    const owned = preview
    return () => {
      owned.targets.delete(target)
      if (!owned.targets.size && this.previews.get(id) === owned) {
        this.previews.delete(id)
        owned.scene?.destroy()
      }
    }
  }

  private renderer(generation: number) {
    return this.application ??= (async () => {
      const app = new Application()
      try {
        await app.init({ width: 480, height: 360, resolution: 1, antialias: true, backgroundColor: 0xffffff, autoStart: false })
        if (generation !== this.generation) throw new DOMException('Preview closed', 'AbortError')
        app.canvas.dataset.officePreviewRenderer = ''
        return app
      } catch (error) {
        if (app.renderer) app.destroy({ removeView: true, releaseGlobalResources: false }, { children: true })
        else app.stage.destroy({ children: true })
        throw error
      }
    })()
  }

  private copy(source: HTMLCanvasElement, target: Target, frame: number) {
    if (target.canvas.width !== source.width) target.canvas.width = source.width
    if (target.canvas.height !== source.height) target.canvas.height = source.height
    target.canvas.getContext('2d', { alpha: false })?.drawImage(source, 0, 0)
    target.canvas.dataset.frame = String(frame)
  }

  private schedule(delay = 500) {
    if (this.timer || this.sampling || !this.previews.size) return
    const generation = this.generation
    this.timer = setTimeout(() => { this.timer = undefined; this.samplingTask = this.sample(generation) }, delay)
  }

  private async sample(generation: number) {
    if (generation !== this.generation) return
    this.sampling = true
    try {
      if (document.hidden) return
      const app = await this.renderer(generation)
      for (const [id, preview] of this.previews) {
        if (generation !== this.generation) return
        const target = [...preview.targets][0]
        if (!target) continue
        const width = Math.min(480, Math.max(160, target.canvas.clientWidth))
        const height = Math.max(120, Math.min(640, Math.round(width * target.canvas.clientHeight / Math.max(1, target.canvas.clientWidth))))
        const signature = JSON.stringify(preview.session.runtime.readActors().map(actor => [actor.id, actor.templateId]))
        try {
          if (!preview.scene || preview.signature !== signature) {
            preview.scene?.destroy()
            const session = preview.session
            const scene = new OfficeScene({ runtime: session.runtime, simulation: session.simulation, previewRenderer: app,
              presentation: 'reference', whiteboardProgress: session.whiteboardProgress,
              taskForActor: actorId => officeActorTasks(session.getSnapshot().dashboard).get(actorId) })
            preview.scene = scene; preview.signature = signature
            await scene.init(document.createElement('div'), width, height)
            await scene.prepareActions()
          }
          if (generation !== this.generation || this.previews.get(id) !== preview || !preview.targets.size) continue
          const now = performance.now()
          preview.scene.resize(width, height)
          if (!preview.scene.renderPreview(preview.sampledAt ? (now - preview.sampledAt) / 1000 : 0)) continue
          if (!await preview.scene.whenFrameReady() || generation !== this.generation || this.previews.get(id) !== preview) continue
          preview.sampledAt = now; preview.frame++
          const cached = this.cache.get(id)?.session === preview.session ? this.cache.get(id)! : { session: preview.session, canvas: document.createElement('canvas'), frame: 0 }
          if (cached.canvas.width !== width) cached.canvas.width = width
          if (cached.canvas.height !== height) cached.canvas.height = height
          cached.frame = preview.frame
          cached.canvas.getContext('2d', { alpha: false })?.drawImage(app.canvas, 0, 0)
          this.cache.delete(id); this.cache.set(id, cached)
          while (this.cache.size > 12) this.cache.delete(this.cache.keys().next().value!)
          for (const item of preview.targets) { this.copy(cached.canvas, item, preview.frame); item.state('ready') }
        } catch (error) {
          if (generation !== this.generation || this.previews.get(id) !== preview) continue
          console.warn(`[OfficePreview] ${id}`, error)
          for (const item of preview.targets) item.state('error')
        }
      }
    } catch (error) {
      if (generation === this.generation) {
        console.warn('[OfficePreview] renderer unavailable', error)
        for (const preview of this.previews.values()) for (const target of preview.targets) target.state('error')
      }
    } finally {
      if (generation === this.generation) { this.sampling = false; this.schedule() }
    }
  }

  stop() {
    this.generation++
    clearTimeout(this.timer); this.timer = undefined; this.sampling = false
    for (const preview of this.previews.values()) preview.scene?.destroy()
    this.previews.clear()
    const application = this.application
    const sampling = this.samplingTask
    this.application = undefined
    void application?.then(async app => { await sampling; app.destroy({ removeView: true, releaseGlobalResources: false }, { children: true }) }).catch(() => {})
  }
}
