import { Application, Container, Graphics, Rectangle, Sprite } from 'pixi.js'
import type { FederatedPointerEvent } from 'pixi.js'
import type { SceneReadPort } from '@pixoffice/runtime'
import type { Point, Prop } from '@pixoffice/runtime/model'
import { SceneFault } from '@pixoffice/runtime/protocol'
import type { CommandResult, SceneCommand } from '@pixoffice/runtime/protocol'
import { convexAreaContains } from '@pixoffice/runtime/walkableArea'
import { FURNITURE_CELL_SIZE, furnitureCells } from '@pixoffice/runtime/map/furnitureGrid'
import type { VisualAssetManifest } from '@pixoffice/contracts/animation'
import type { AnimationRegistry } from './animation/AnimationRegistry.ts'
import { AnimationResources } from './presentation/AnimationResources.ts'
import { ActorView } from './ActorView.ts'
import type { PropView, PropViewRegistry } from './PropViewRegistry.ts'
import type { ScenePresentationPack } from './ScenePresentationPack.ts'
import { renderResolution, watchPixelDensity } from './pixelDensity.ts'

export type SceneLoadProgress = { completed: number; total: number }
export type SceneActionProgress = SceneLoadProgress & { ready: boolean; error?: string }
export interface SceneViewOptions {
  runtime: SceneReadPort
  onStep?: (elapsedMs: number) => void
  dispatchCommand?: (command: SceneCommand) => CommandResult
  pack: ScenePresentationPack
  animations: AnimationRegistry<Container>
  resolveAppearance(id: string): Promise<VisualAssetManifest>
  propViews?: PropViewRegistry
  onActorClick?: (event: { actorId: string; clientX: number; clientY: number }) => void
  onDraftChange?: (error: string | null) => void
  onLoadProgress?: (progress: SceneLoadProgress) => void
  onActionProgress?: (progress: SceneActionProgress) => void
}
const commandBase = (runtime: SceneReadPort) => ({ protocolVersion: '2.0' as const, sceneId: runtime.sceneId, commandId: `cmd-${globalThis.crypto.randomUUID()}` })

export class SceneView {
  readonly runtime: SceneReadPort
  protected options: SceneViewOptions
  private app: Application | null = null
  private world: Container | null = null
  private layer: Container | null = null
  private grid = new Graphics()
  private agentEntities = new Map<string, ActorView>()
  private propViews = new Map<string, PropView>()
  private propViewTemplates = new Map<string, string>()
  private viewRegistry: PropViewRegistry
  private pack: ScenePresentationPack
  private abort = new AbortController()
  private destroyed = false
  private renderingSuspended = false
  private lastRevision = -1
  private unsubscribe?: () => void
  private unwatchPixelDensity?: () => void
  private editorPreview?: { id: string; position: Point; templateId?: string; name?: string }
  private editorHighlight?: { id: string; valid: boolean }
  private characterLease?: AnimationResources<Container>
  private actionsReady = true
  private firstFrameReady = false
  private actionPreparation?: Promise<void>

  constructor(options: SceneViewOptions) {
    this.options = options
    this.pack = options.pack
    this.viewRegistry = options.propViews ?? options.pack.createPropViews()
    this.runtime = options.runtime
  }
  protected onReady() {}
  protected onRevision() {}
  protected afterTick(_dt: number) { void _dt }
  protected beforeEditing() {}
  protected onDestroy() {}
  protected refresh() {
    if (this.layer && !this.renderingSuspended) { this.syncActors(0); this.app?.render() }
  }
  async init(host: HTMLElement, width: number, height: number) {
    if (this.destroyed) return
    this.actionsReady = false
    const backgroundReady = this.pack.loadBackground()
    const app = new Application()
    await app.init({ width, height, backgroundColor: 0xffffff, antialias: true, resolution: renderResolution(), autoDensity: true })
    if (this.destroyed) { app.destroy(true, { children: true }); return }
    // Keep the simulation ticker alive when a modal hides the scene.
    app.ticker.remove(app.render, app)
    app.ticker.maxFPS = 60
    this.app = app; host.appendChild(app.canvas)
    this.world = new Container(); app.stage.addChild(this.world)
    this.resize(width, height)
    this.unwatchPixelDensity = watchPixelDensity(() => this.resize(app.screen.width, app.screen.height))
    const initialActors = this.pack.projectActors(this.runtime)
    const characterIds = [...new Set(initialActors.map(actor => actor.appearanceId))]
    const total = this.pack.resourceCount + characterIds.length, completed = new Set<string>()
    const report = (resource?: string) => {
      if (this.destroyed) return
      if (resource) completed.add(resource)
      this.options.onLoadProgress?.({ completed: completed.size, total })
    }
    report()
    const backgroundShown = backgroundReady.then(background => {
      if (this.destroyed) return
      if (background) {
        const data = this.runtime.readWorld()
        const sprite = new Sprite(background), scale = Math.min(data.width * this.pack.cellPixels / background.width, data.height * this.pack.cellPixels / background.height)
        sprite.scale.set(scale); sprite.position.set((data.width * this.pack.cellPixels - background.width * scale) / 2, (data.height * this.pack.cellPixels - background.height * scale) / 2)
        this.world!.addChild(sprite)
      }
      app.render()
      report('background')
      performance.mark('pixoffice:background-visible')
    })
    const charactersReady = (async () => {
      const resources = await AnimationResources.load(initialActors, this.options.animations, this.options.resolveAppearance, this.abort.signal, id => report(`character:${id}`))
      if (this.destroyed) { resources.release(); return }
      this.characterLease = resources
    })()
    const loaded = await Promise.allSettled([backgroundShown, charactersReady, this.pack.loadObjects(report)])
    if (this.destroyed) return
    const failed = loaded.find(result => result.status === 'rejected')
    if (failed?.status === 'rejected') {
      this.characterLease?.release(); this.characterLease = undefined
      throw failed.reason
    }
    const data = this.runtime.readWorld()
    this.world.addChild(this.grid)
    this.layer = new Container(); this.layer.sortableChildren = true; this.world.addChild(this.layer)
    for (const prop of data.props) this.mountProp(prop)
    initialActors.forEach(actor => {
      const entity = new ActorView(actor, this.characterLease?.get(actor.appearanceId))
      entity.on('pointertap', (event: FederatedPointerEvent) => {
        if (!this.actionsReady || this.runtime.isEditing) return
        event.stopPropagation()
        this.options.onActorClick?.({ actorId: actor.id, clientX: event.clientX, clientY: event.clientY })
      })
      this.agentEntities.set(actor.id, entity); this.layer!.addChild(entity)
    })
    app.stage.eventMode = 'static'
    this.resize(app.screen.width, app.screen.height)
    this.unsubscribe = this.runtime.subscribe(() => this.syncProps())
    this.syncProps(); this.syncActors(0)
    if (!this.renderingSuspended) app.render()
    app.ticker.add(this.onTick)
    this.firstFrameReady = true
    performance.mark('pixoffice:scene-ready')
    void this.prepareActions()
  }

  get areActionsReady() { return this.actionsReady }
  prepareActions(): Promise<void> {
    if (this.destroyed || !this.firstFrameReady) return Promise.resolve()
    if (this.actionPreparation) return this.actionPreparation
    const resources = this.characterLease
    if (!resources) return Promise.resolve()
    const report = (error?: string) => {
      if (!this.destroyed) this.options.onActionProgress?.({ completed: resources.completed, total: resources.size, ready: this.actionsReady, error })
    }
    const finish = () => {
      if (this.destroyed) return
      this.actionsReady = true
      this.onReady(); report()
      performance.mark('pixoffice:actions-ready')
    }
    if (resources.isComplete) { finish(); return Promise.resolve() }
    this.actionsReady = false; report()
    this.actionPreparation = (async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
      if (this.destroyed) return
      try { await resources.prepareAll(this.abort.signal, () => report()); finish() }
      catch (error) { report(error instanceof Error ? error.message : '互动动作加载失败') }
    })().finally(() => { this.actionPreparation = undefined })
    return this.actionPreparation
  }
  protected requireActions() {
    if (!this.actionsReady) throw new SceneFault('RESOURCES_LOADING', '互动动作正在准备，请稍候')
  }
  private dispatch(command: SceneCommand) {
    if (!this.options.dispatchCommand) throw new SceneFault('READ_ONLY_VIEW', 'This view has no command dispatcher')
    return this.options.dispatchCommand(command)
  }

  setRenderingSuspended(suspended: boolean) {
    if (this.destroyed || this.renderingSuspended === suspended) return
    this.renderingSuspended = suspended
    if (!suspended && this.layer) {
      this.syncProps()
      this.app?.render()
    }
  }

  beginEditing() {
    this.requireActions()
    this.beforeEditing()
    const result = this.dispatch({ ...commandBase(this.runtime), type: 'map.edit', edit: { action: 'begin', expectedLayoutRevision: this.runtime.readWorld().layoutRevision } })
    if (result.error) throw new SceneFault(result.error.code, result.error.message)
  }
  cancelEditing() {
    const draft = this.runtime.editorSnapshot()
    if (draft) this.dispatch({ ...commandBase(this.runtime), type: 'map.edit', edit: { action: 'cancel', draftId: draft.id, expectedDraftRevision: draft.revision } })
    this.editorPreview = undefined; this.options.onDraftChange?.(null); this.syncProps()
  }
  applyEditing() {
    const draft = this.runtime.editorSnapshot()
    if (!draft) return
    const result = this.dispatch({ ...commandBase(this.runtime), type: 'map.edit', edit: { action: 'commit', draftId: draft.id, expectedDraftRevision: draft.revision } })
    if (result.status !== 'completed') throw new SceneFault(result.error?.code ?? 'LAYOUT_FAILED', result.error?.message ?? '布局提交失败')
    this.editorPreview = undefined
  }
  previewProp(preview?: { id: string; position: Point; templateId?: string; name?: string }) { this.editorPreview = preview; this.syncProps() }
  highlightProp(id: string, valid: boolean) { this.editorHighlight = id ? { id, valid } : undefined; this.syncProps() }
  async furnitureThumbnail(templateId: string) {
    if (!this.app || this.destroyed) return ''
    const template = this.runtime.template(templateId)
    const prop: Prop = { id: 'thumbnail', name: template.name, templateId, position: { x: 0, y: 0 }, state: {}, stateRevision: 0 }
    const view = this.viewRegistry.create(prop, template), root = new Container()
    root.sortableChildren = true; root.addChild(...view.roots); view.update(prop, template, []); root.sortChildren()
    try { return await this.app.renderer.extract.base64({ target: root, resolution: 2, clearColor: [0, 0, 0, 0] }) }
    finally { root.destroy({ children: true }) }
  }
  private viewWorld() {
    const world = this.runtime.isEditing ? this.runtime.readEditorWorld() : this.runtime.readWorld()
    if (this.editorPreview && this.runtime.isEditing) {
      const prop = world.props.find(p => p.id === this.editorPreview!.id)
      if (prop) {
        prop.position = this.editorPreview.position
        for (const actor of world.actors.filter(a => a.homeId === prop.id)) {
          const port = this.runtime.template(prop.templateId).interactions?.seat
          if (port) actor.position = this.runtime.navigation.anchor(world, prop.id, port.anchor)
        }
      } else if (this.editorPreview.templateId) {
        world.props.push({ ...this.editorPreview, templateId: this.editorPreview.templateId, name: this.editorPreview.name ?? '', state: {}, stateRevision: 0 })
      }
    }
    return world
  }

  private mountProp(prop: Prop) {
    const view = this.viewRegistry.create(prop, this.runtime.template(prop.templateId))
    this.propViews.set(prop.id, view)
    this.propViewTemplates.set(prop.id, prop.templateId)
    this.layer!.addChild(...view.roots)
    view.hitTarget.eventMode = 'none'
  }
  private syncProps() {
    if (this.renderingSuspended) return
    if (!this.runtime.isEditing) this.editorPreview = undefined
    const world = this.viewWorld()
    if (this.runtime.isEditing) this.beforeEditing()
    if (this.layer) {
      for (const [id, view] of this.propViews) if (!world.props.some(p => p.id === id && p.templateId === this.propViewTemplates.get(id))) {
        view.roots.forEach(root => root.destroy({ children: true })); this.propViews.delete(id); this.propViewTemplates.delete(id)
      }
      if (this.layer instanceof Container) for (const prop of world.props) if (!this.propViews.has(prop.id)) this.mountProp(prop)
    }
    this.grid.clear()
    if (this.runtime.isEditing && world.walkableArea) {
      try {
        const inside = convexAreaContains(world.walkableArea), size = FURNITURE_CELL_SIZE
        for (let y = Math.ceil(world.bounds.top / size) * size; y < world.bounds.bottom; y += size) for (let x = Math.ceil(world.bounds.left / size) * size; x < world.bounds.right; x += size) {
          if ([{ x, y }, { x: x + size, y }, { x, y: y + size }, { x: x + size, y: y + size }].every(p => inside(p))) this.grid.rect(x * this.pack.cellPixels, y * this.pack.cellPixels, this.pack.cellPixels, this.pack.cellPixels)
        }
        this.grid.stroke({ color: 0x6b8c7a, alpha: .25, width: .9 })
      } catch { /* Invalid imported boundaries stay editable. */ }
    }
    const selected = this.runtime.isEditing && world.props.find(p => p.id === this.editorHighlight?.id)
    if (selected) {
      const template = this.runtime.template(selected.templateId), size = this.pack.cellPixels
      const color = this.editorHighlight!.valid ? 0x56ab99 : 0xdb756a
      for (const p of furnitureCells(template)) this.grid.roundRect((selected.position.x + p.x) * size + 1, (selected.position.y + p.y) * size + 1, size - 2, size - 2, 2)
      this.grid.fill({ color, alpha: .35 }).stroke({ color, alpha: .8, width: .6 })
      for (const key of new Set(Object.values(template.interactions ?? {}).flatMap(i => i.approaches))) {
        const p = template.anchors[key]
        const center = this.pack.cellCenter({ x: selected.position.x + p.x, y: selected.position.y + p.y })
        this.grid.circle(center.x, center.y, 4).fill(0xffffff).stroke({ color, width: 1.5 })
      }
    }
    for (const area of world.blockedAreas ?? []) {
      const b = area.bounds
      this.grid.rect(b.left * this.pack.cellPixels, b.top * this.pack.cellPixels, (b.right - b.left) * this.pack.cellPixels, (b.bottom - b.top) * this.pack.cellPixels).fill({ color: 0xb86b58, alpha: .09 }).stroke({ color: 0xb86b58, alpha: .25, width: 1 })
    }
    this.syncActors(0)
  }
  private syncActors(dt: number) {
    const world = this.viewWorld()
    const agents = this.pack.projectActors(this.runtime, this.runtime.isEditing ? world : undefined)
    for (const prop of world.props) this.propViews.get(prop.id)?.update(prop, this.runtime.template(prop.templateId), agents)
    for (const agent of agents) {
      const entity = this.agentEntities.get(agent.id)
      entity?.update(agent, dt)
    }
    this.layer?.sortChildren()
  }
  private onTick = (ticker: { deltaTime: number }) => {
    const dt = Math.min(ticker.deltaTime / 60, .05)
    if (this.actionsReady) this.options.onStep?.(dt * 1000)
    if (!this.renderingSuspended) {
      this.syncActors(dt)
      this.app?.render()
    }
    if (this.lastRevision !== this.runtime.getRevision()) {
      this.lastRevision = this.runtime.getRevision(); this.onRevision()
    }
    this.afterTick(dt)
  }
  resize(width: number, height: number) {
    if (!this.app || !this.world) return
    const data = this.runtime.readWorld(), scale = Math.min(width / (data.width * this.pack.cellPixels), height / (data.height * this.pack.cellPixels))
    this.app.renderer.resize(width, height, renderResolution()); this.app.stage.hitArea = new Rectangle(0, 0, width, height)
    this.world.scale.set(scale); this.world.position.set((width - data.width * this.pack.cellPixels * scale) / 2, (height - data.height * this.pack.cellPixels * scale) / 2)
    Object.assign(this.app.canvas.style, { display: 'block', width: '100%', height: '100%' })
    if (!this.layer && !this.renderingSuspended) this.app.render()
  }
  destroy() {
    if (this.destroyed) return
    this.destroyed = true; this.abort.abort(); this.unsubscribe?.(); this.unwatchPixelDensity?.(); this.onDestroy()
    this.app?.ticker.remove(this.onTick); this.app?.destroy(true, { children: true })
    this.characterLease?.release(); this.characterLease = undefined
    this.app = null; this.world = null; this.layer = null; this.agentEntities.clear(); this.propViews.clear(); this.propViewTemplates.clear()
  }
}
