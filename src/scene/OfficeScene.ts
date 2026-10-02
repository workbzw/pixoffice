import { Application, Container, Graphics, Rectangle, Sprite } from 'pixi.js'
import type { FederatedPointerEvent } from 'pixi.js'
import type { Agent, AgentState } from '@/types/agent'
import { AgentEntity } from './entities/AgentEntity'
import { createOfficePropViews } from './views/propViews'
import type { PropView, PropViewRegistry } from './views/propViews'
import { loadOfficeBackground, loadOfficeFurniture } from './assets/loadOfficeAssets'
import { loadWorkstationTrialAssets } from './assets/loadWorkstationTrialAssets'
import { loadApartmentAssets, supportsCharacterPose } from './assets/loadApartmentAssets'
import { bindOfficeScene, unbindOfficeScene } from './officeSceneBridge'
import { notifyVisitMissionActivity } from '@/services/officeActionDispatcher'
import { setOfficeAgents } from '@/store/officeStore'
import { createOfficeRuntime } from '@/runtime/createOfficeRuntime'
import type { OfficeRuntime } from '@/runtime/OfficeRuntime'
import type { Point, Prop } from '@/runtime/model'
import { commandBase, presentationCommand, projectAgents, visitCommand } from '@/runtime/adapters/legacy'
import { SceneFault } from '@/runtime/protocol'
import { computeAgentDepthZ } from './systems/deskDepthSort'
import { demoCommands } from './systems/officeDemo'
import { convexAreaContains } from '@/runtime/walkableArea'
import { FURNITURE_CELL_SIZE, furnitureCells } from '@/runtime/map/furnitureGrid'
import { CELL_PIXELS, cellCenter } from './gridProjection'
import { apartmentPoseForState, shouldSitAtDesk } from './characters/apartmentFrames'
import { characterPoseClip } from '@/contracts/characterPose'
import type { CharacterManifest } from './characters/packSchema'

export type OfficeAgentClick = { agent: Agent; rosterNo: number; clientX: number; clientY: number }
export type SceneLoadProgress = { completed: number; total: number }
export type SceneActionProgress = SceneLoadProgress & { ready: boolean; error?: string }
type Options = { runtime?: OfficeRuntime; propViews?: PropViewRegistry; onAgentClick?: (event: OfficeAgentClick) => void; onDraftChange?: (error: string | null) => void; onDemoChange?: (enabled: boolean) => void; onLoadProgress?: (progress: SceneLoadProgress) => void; onActionProgress?: (progress: SceneActionProgress) => void }

function initialCharacterClip(agent: Agent, manifest: CharacterManifest) {
  const facing = agent.viewFacing ?? 'front', pose = apartmentPoseForState(agent.state, agent.customAnimation, shouldSitAtDesk(agent))
  let name = pose === 'walking' ? `walk.${facing}` : pose === 'idle' ? `idle.${facing}` : `emote.${pose}`
  if (pose === 'seated' || pose === 'typing') {
    name = characterPoseClip('seated', facing)
    if (pose === 'typing' && facing === 'back') {
      if (manifest.clips['work.quiet-back'] || manifest.work) name = 'work.quiet-back'
      else if (manifest.clips['work.typing-back']) name = 'work.typing-back'
    }
  }
  if (agent.bubbleText && !manifest.mouth && ['idle', 'seated', 'typing'].includes(pose)) {
    const speech = pose === 'seated' || pose === 'typing' ? `speak.seated-${facing}` : `speak.${facing}`
    if (manifest.clips[speech]) name = speech
  }
  if (agent.seatTransition) {
    const stage = agent.seatTransition.stage
    name = stage === 'rising' ? 'stand-up.back' : stage === 'sitting' ? 'sit-down.back' : `${['entering', 'exiting'].includes(stage) ? 'walk' : 'idle'}.${facing}`
  }
  return name
}

/** Pixi adapter: all authoritative state belongs to OfficeRuntime. */
export class OfficeScene {
  readonly runtime: OfficeRuntime
  private options: Options
  private ownsRuntime: boolean
  private app: Application | null = null
  private world: Container | null = null
  private layer: Container | null = null
  private grid = new Graphics()
  private agentEntities = new Map<string, AgentEntity>()
  private propViews = new Map<string, PropView>()
  private propViewTemplates = new Map<string, string>()
  private viewRegistry: PropViewRegistry
  private destroyed = false
  private renderingSuspended = false
  private lastRevision = -1
  private unsubscribe?: () => void
  private editorPreview?: { id: string; position: Point; templateId?: string; name?: string }
  private editorHighlight?: { id: string; valid: boolean }
  private demo = false
  private demoTimer = 0
  private demoRound = 0
  private demoCommandIds: string[] = []
  private workstationTrial = true
  private characterLease?: Awaited<ReturnType<typeof loadApartmentAssets>>
  private actionsReady = true
  private firstFrameReady = false
  private actionPreparation?: Promise<void>

  constructor(options: Options = {}) {
    this.options = options
    this.viewRegistry = options.propViews ?? createOfficePropViews(() => this.workstationTrial)
    this.runtime = options.runtime ?? createOfficeRuntime({ supportsPose: supportsCharacterPose })
    this.ownsRuntime = !options.runtime
  }
  async init(host: HTMLElement, width: number, height: number) {
    if (this.destroyed) return
    this.actionsReady = false
    const backgroundReady = loadOfficeBackground()
    const app = new Application()
    await app.init({ width, height, backgroundColor: 0xffffff, antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true })
    if (this.destroyed) { app.destroy(true, { children: true }); return }
    // Keep the simulation ticker alive when a modal hides the scene.
    app.ticker.remove(app.render, app)
    app.ticker.maxFPS = 60
    this.app = app; host.appendChild(app.canvas)
    this.world = new Container(); app.stage.addChild(this.world)
    this.resize(width, height)
    const characterIds = [...new Set(this.getAgents().map(agent => agent.appearanceId ?? agent.id))]
    const total = 6 + characterIds.length, completed = new Set<string>()
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
        const sprite = new Sprite(background), scale = Math.min(data.width * CELL_PIXELS / background.width, data.height * CELL_PIXELS / background.height)
        sprite.scale.set(scale); sprite.position.set((data.width * CELL_PIXELS - background.width * scale) / 2, (data.height * CELL_PIXELS - background.height * scale) / 2)
        this.world!.addChild(sprite)
      }
      app.render()
      report('background')
      performance.mark('pixoffice:background-visible')
    })
    const charactersReady = (async () => {
      const apartment = await loadApartmentAssets(characterIds, id => report(`character:${id}`), {
        preload: 'startup', clipsForPack: pack => this.getAgents().filter(agent => (agent.appearanceId ?? agent.id) === pack.manifest.id).map(agent => initialCharacterClip(agent, pack.manifest)),
      })
      if (this.destroyed) { if (apartment) apartment.release(); return }
      if (apartment) this.characterLease = apartment
      else characterIds.forEach(id => report(`character:${id}`))
    })()
    await Promise.all([
      backgroundShown, charactersReady,
      loadOfficeFurniture(part => report(`furniture:${part}`)),
      loadWorkstationTrialAssets(part => report(`workstation:${part}`)),
    ])
    if (this.destroyed) return
    const data = this.runtime.readWorld()
    this.world.addChild(this.grid)
    this.layer = new Container(); this.layer.sortableChildren = true; this.world.addChild(this.layer)
    for (const prop of data.props) this.mountProp(prop)
    this.getAgents().forEach(agent => {
      // A failed group releases all leases; do not mount frame views from its idle cache.
      const entity = new AgentEntity(agent, Boolean(this.characterLease))
      entity.on('pointertap', (event: FederatedPointerEvent) => {
        if (!this.actionsReady || this.runtime.isEditing) return
        event.stopPropagation()
        const agents = this.getAgents(), index = agents.findIndex(current => current.id === agent.id)
        if (index >= 0) this.options.onAgentClick?.({ agent: agents[index], rosterNo: index + 1, clientX: event.clientX, clientY: event.clientY })
      })
      this.agentEntities.set(agent.id, entity); this.layer!.addChild(entity)
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
    const packs = this.characterLease?.packs ?? [], complete = new Set(packs.filter(pack => pack.isComplete).map(pack => pack.manifest.id))
    const report = (error?: string) => {
      if (!this.destroyed) this.options.onActionProgress?.({ completed: complete.size, total: packs.length, ready: this.actionsReady, error })
    }
    const finish = () => {
      if (this.destroyed) return
      this.actionsReady = true
      bindOfficeScene(this)
      report()
      performance.mark('pixoffice:actions-ready')
    }
    if (complete.size === packs.length) { finish(); return Promise.resolve() }
    this.actionsReady = false
    report()
    this.actionPreparation = (async () => {
      // Yield the first complete office frame before scheduling noncritical pages.
      await new Promise(resolve => setTimeout(resolve, 0))
      if (this.destroyed) return
      const results = await Promise.allSettled(packs.map(async pack => {
        await pack.ensureAll(); complete.add(pack.manifest.id); report()
      }))
      if (this.destroyed) return
      const failed = results.find(result => result.status === 'rejected')
      if (failed?.status === 'rejected') report(failed.reason instanceof Error ? failed.reason.message : '互动动作加载失败')
      else finish()
    })().finally(() => { this.actionPreparation = undefined })
    return this.actionPreparation
  }
  private requireActions() {
    if (!this.actionsReady) throw new SceneFault('RESOURCES_LOADING', '互动动作正在准备，请稍候')
  }

  getAgents() { return projectAgents(this.runtime) }
  requestDeskVisit(visitor: number, host: number, message: string) { this.requireActions(); return this.runtime.submit(visitCommand(this.runtime, visitor, [host], () => message)) }
  requestDeskVisitTour(visitor: number, hosts: number[], message?: (no: number, name: string) => string) { this.requireActions(); return this.runtime.submit(visitCommand(this.runtime, visitor, hosts, message ?? ((_, name) => `${name}，请接手下一步。`))) }
  setAgentState(id: string, state: AgentState, task?: string) { this.requireActions(); return this.runtime.submit(presentationCommand(this.runtime, id, state, task)) }
  playAgentAnimation(id: string, animation: string) { this.requireActions(); return this.runtime.submit({ ...commandBase(this.runtime), type: 'activity.start', capability: 'office.emote', participants: [{ entityId: id, role: 'actor' }], params: { animation } }) }
  get isDemoRunning() { return this.demo }
  setWorkstationTrial(enabled: boolean) {
    this.workstationTrial = enabled
    if (this.layer && !this.renderingSuspended) {
      this.syncActors(0)
      this.app?.render()
    }
  }
  setDemo(enabled: boolean) {
    if (enabled) {
      this.requireActions()
      const snapshot = this.runtime.snapshot()
      if (snapshot.persistenceError) throw new SceneFault('PERSISTENCE_FAILED', '存档尚未恢复，请先点击“备份并恢复布局”')
      if (snapshot.editing) throw new SceneFault('EDITING', '请先完成布局编辑')
    }
    this.demo = enabled; this.demoTimer = 0; this.demoCommandIds = []
    this.options.onDemoChange?.(enabled)
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
    this.setDemo(false)
    const result = this.runtime.submit({ ...commandBase(this.runtime), type: 'map.edit', edit: { action: 'begin', expectedLayoutRevision: this.runtime.readWorld().layoutRevision } })
    if (result.error) throw new SceneFault(result.error.code, result.error.message)
  }
  cancelEditing() {
    const draft = this.runtime.editorSnapshot()
    if (draft) this.runtime.submit({ ...commandBase(this.runtime), type: 'map.edit', edit: { action: 'cancel', draftId: draft.id, expectedDraftRevision: draft.revision } })
    this.editorPreview = undefined; this.options.onDraftChange?.(null); this.syncProps()
  }
  applyEditing() {
    const draft = this.runtime.editorSnapshot()
    if (!draft) return
    const result = this.runtime.submit({ ...commandBase(this.runtime), type: 'map.edit', edit: { action: 'commit', draftId: draft.id, expectedDraftRevision: draft.revision } })
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
        for (const actor of world.actors.filter(a => a.homeId === prop.id)) actor.position = this.runtime.navigation.anchor(world, prop.id, 'seat')
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
    if (this.runtime.isEditing && this.demo) this.setDemo(false)
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
          if ([{ x, y }, { x: x + size, y }, { x, y: y + size }, { x: x + size, y: y + size }].every(p => inside(p))) this.grid.rect(x * CELL_PIXELS, y * CELL_PIXELS, CELL_PIXELS, CELL_PIXELS)
        }
        this.grid.stroke({ color: 0x6b8c7a, alpha: .25, width: .9 })
      } catch { /* Invalid imported boundaries stay editable. */ }
    }
    const selected = this.runtime.isEditing && world.props.find(p => p.id === this.editorHighlight?.id)
    if (selected) {
      const template = this.runtime.template(selected.templateId), size = CELL_PIXELS
      const color = this.editorHighlight!.valid ? 0x56ab99 : 0xdb756a
      for (const p of furnitureCells(template)) this.grid.roundRect((selected.position.x + p.x) * size + 1, (selected.position.y + p.y) * size + 1, size - 2, size - 2, 2)
      this.grid.fill({ color, alpha: .35 }).stroke({ color, alpha: .8, width: .6 })
      for (const key of new Set(Object.values(template.interactions ?? {}).flatMap(i => i.approaches))) {
        const p = template.anchors[key]
        const center = cellCenter({ x: selected.position.x + p.x, y: selected.position.y + p.y })
        this.grid.circle(center.x, center.y, 4).fill(0xffffff).stroke({ color, width: 1.5 })
      }
    }
    for (const area of world.blockedAreas ?? []) {
      const b = area.bounds
      this.grid.rect(b.left * CELL_PIXELS, b.top * CELL_PIXELS, (b.right - b.left) * CELL_PIXELS, (b.bottom - b.top) * CELL_PIXELS).fill({ color: 0xb86b58, alpha: .09 }).stroke({ color: 0xb86b58, alpha: .25, width: 1 })
    }
    this.syncActors(0)
  }
  private syncActors(dt: number) {
    const world = this.viewWorld()
    const agents = projectAgents(this.runtime, false, this.runtime.isEditing ? world : undefined)
    for (const prop of world.props) this.propViews.get(prop.id)?.update(prop, this.runtime.template(prop.templateId), agents)
    for (const agent of agents) {
      const entity = this.agentEntities.get(agent.id)
      entity?.apply(agent); entity?.setPosition(agent.x, agent.y)
      entity?.setWorkSurface(agent.assignedDeskId ? this.propViews.get(agent.assignedDeskId)?.getWorkSurface?.() : undefined)
      entity?.updateVisuals(agent.state, dt)
      if (entity) entity.zIndex = computeAgentDepthZ(agent)
    }
    this.layer?.sortChildren()
  }
  private onTick = (ticker: { deltaTime: number }) => {
    const dt = Math.min(ticker.deltaTime / 60, .05)
    if (this.actionsReady) this.runtime.tick(dt * 1000)
    if (!this.renderingSuspended) {
      this.syncActors(dt)
      this.app?.render()
    }
    if (this.lastRevision !== this.runtime.getRevision()) {
      this.lastRevision = this.runtime.getRevision(); setOfficeAgents(this.getAgents()); notifyVisitMissionActivity(this.getAgents())
    }
    if (this.actionsReady && this.demo && !this.runtime.isEditing) {
      try {
        const snapshot = this.runtime.snapshot()
        const failed = snapshot.records.find(record => this.demoCommandIds.includes(record.command.commandId) && record.error)
        if (failed?.error) throw new SceneFault(failed.error.code, failed.error.message)
        const busy = snapshot.activities.some(a => a.status === 'active') || snapshot.records.some(r => r.status === 'queued') || snapshot.world.actors.some(a => a.seatTransition)
        if (busy) return
        this.demoTimer -= dt
        if (this.demoTimer > 0) return
        const commands = demoCommands(this.runtime, this.demoRound)
        if (!commands.length) throw new SceneFault('DEMO_ROSTER', '演示至少需要两位有工位的同事')
        this.demoCommandIds = []
        for (const command of commands) {
          const result = this.runtime.submit(command)
          if (result.error) throw new SceneFault(result.error.code, result.error.message)
          this.demoCommandIds.push(result.commandId)
        }
        this.demoRound++; this.demoTimer = 1.2
      } catch (error) {
        this.setDemo(false)
        this.options.onDraftChange?.(error instanceof Error ? error.message : '演示启动失败')
      }
    }
  }
  resize(width: number, height: number) {
    if (!this.app || !this.world) return
    const data = this.runtime.readWorld(), scale = Math.min(width / (data.width * CELL_PIXELS), height / (data.height * CELL_PIXELS))
    this.app.renderer.resize(width, height); this.app.stage.hitArea = new Rectangle(0, 0, width, height)
    this.world.scale.set(scale); this.world.position.set((width - data.width * CELL_PIXELS * scale) / 2, (height - data.height * CELL_PIXELS * scale) / 2)
    Object.assign(this.app.canvas.style, { display: 'block', width: '100%', height: '100%' })
    if (!this.layer && !this.renderingSuspended) this.app.render()
  }
  destroy() {
    if (this.destroyed) return
    this.destroyed = true; this.unsubscribe?.(); unbindOfficeScene(this)
    if (this.ownsRuntime && this.runtime.isEditing) this.cancelEditing()
    if (this.ownsRuntime) this.runtime.dispose()
    this.app?.ticker.remove(this.onTick); this.app?.destroy(true, { children: true })
    this.characterLease?.release(); this.characterLease = undefined
    this.app = null; this.world = null; this.layer = null; this.agentEntities.clear(); this.propViews.clear(); this.propViewTemplates.clear()
  }
}
