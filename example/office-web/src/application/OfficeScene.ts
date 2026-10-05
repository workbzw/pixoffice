import { SceneView } from '@pixoffice/renderer-pixi/SceneView'
import type { SceneRuntime } from '@pixoffice/runtime'
import type { Container } from 'pixi.js'
import type { SceneViewOptions, SceneLoadProgress, SceneActionProgress } from '@pixoffice/renderer-pixi/SceneView'
import { AnimationRegistry } from '@pixoffice/renderer-pixi/animation/AnimationRegistry'
import { FrameAdapter } from '@pixoffice/animation-frame/FrameAdapter'
import { createOfficePresentation } from '@pixoffice/scene-office/pixi'
import { resolveOfficeAppearance } from './officeFrames.ts'
import { supportsOfficePose } from '@pixoffice/scene-office/core/poseSupport'
import type { VisualAssetManifest } from '@pixoffice/contracts/animation'
import { createOfficeRuntime } from './createOfficeRuntime.ts'
import { commandBase, presentationCommand, projectAgents, visitCommand } from '@pixoffice/scene-office/adapters/office'
import { bindOfficeScene, unbindOfficeScene } from '../scene/officeSceneBridge.ts'
import { notifyVisitMissionActivity } from '../services/officeActionDispatcher.ts'
import { setOfficeAgents } from '../store/officeStore.ts'
import { demoCommands } from '../scene/systems/officeDemo.ts'
import { SceneFault } from '@pixoffice/runtime/protocol'
import type { Agent, AgentState } from '@pixoffice/scene-office/types'

export type { SceneLoadProgress, SceneActionProgress }
export type OfficeAgentClick = { agent: Agent; rosterNo: number; clientX: number; clientY: number }
export type OfficeSceneOptions = Partial<Pick<SceneViewOptions, 'animations' | 'resolveAppearance' | 'propViews'>> & {
  runtime?: SceneRuntime
  onAgentClick?: (event: OfficeAgentClick) => void
  onDraftChange?: (error: string | null) => void
  onDemoChange?: (enabled: boolean) => void
  onLoadProgress?: (progress: SceneLoadProgress) => void
  onActionProgress?: (progress: SceneActionProgress) => void
}

/** Office application facade; the renderer and animation adapters have no office dependency. */
export class OfficeScene extends SceneView {
  declare readonly runtime: SceneRuntime
  private ownsRuntime: boolean
  private officeOptions: OfficeSceneOptions
  private artwork: { enabled: boolean }
  private demo = false
  private demoTimer = 0
  private demoRound = 0
  private demoCommandIds: string[] = []

  constructor(options: OfficeSceneOptions = {}) {
    const artwork = { enabled: true }, manifests = new Map<string, VisualAssetManifest>()
    const runtime = options.runtime ?? createOfficeRuntime({ supportsPose: (id, posture, facing) => {
      const manifest = manifests.get(id)
      return manifest ? manifest.capabilities.variants.some(v => v.actionId === 'core.idle' && v.poseId === posture && v.view === facing)
        : supportsOfficePose(id, posture, facing)
    } })
    super({
      ...options, runtime,
      onStep: elapsedMs => runtime.tick(elapsedMs),
      dispatchCommand: command => runtime.submit(command),
      pack: createOfficePresentation(() => artwork.enabled),
      animations: options.animations ?? new AnimationRegistry<Container>().register(new FrameAdapter()),
      resolveAppearance: async id => {
        const manifest = await (options.resolveAppearance ?? resolveOfficeAppearance)(id)
        manifests.set(id, manifest)
        return manifest
      },
      onActorClick: event => {
        const agents = projectAgents(runtime), index = agents.findIndex(actor => actor.id === event.actorId)
        if (index >= 0) options.onAgentClick?.({ agent: agents[index], rosterNo: index + 1, clientX: event.clientX, clientY: event.clientY })
      },
    })
    this.officeOptions = options; this.artwork = artwork; this.ownsRuntime = !options.runtime
  }
  protected override onReady() { bindOfficeScene(this) }
  protected override onDestroy() {
    unbindOfficeScene(this)
    if (this.ownsRuntime) {
      if (this.runtime.isEditing) this.cancelEditing()
      this.runtime.dispose()
    }
  }
  protected override onRevision() { const actors = this.getAgents(); setOfficeAgents(actors); notifyVisitMissionActivity(actors) }
  protected override beforeEditing() { this.setDemo(false) }
  getAgents() { return projectAgents(this.runtime) }
  requestDeskVisit(visitor: number, host: number, message: string) { this.requireActions(); return this.runtime.submit(visitCommand(this.runtime, visitor, [host], () => message)) }
  requestDeskVisitTour(visitor: number, hosts: number[], message?: (no: number, name: string) => string) { this.requireActions(); return this.runtime.submit(visitCommand(this.runtime, visitor, hosts, message ?? ((_, name) => `${name}，请接手下一步。`))) }
  setAgentState(id: string, state: AgentState, task?: string) { this.requireActions(); return this.runtime.submit(presentationCommand(this.runtime, id, state, task)) }
  playAgentAnimation(id: string, animation: string) { this.requireActions(); return this.runtime.submit({ ...commandBase(this.runtime), type: 'activity.start', capability: 'office.emote', participants: [{ entityId: id, role: 'actor' }], params: { animation } }) }
  get isDemoRunning() { return this.demo }
  setWorkstationTrial(enabled: boolean) {
    this.artwork.enabled = enabled
    this.refresh()
  }
  setDemo(enabled: boolean) {
    if (enabled) {
      this.requireActions()
      const snapshot = this.runtime.snapshot()
      if (snapshot.persistenceError) throw new SceneFault('PERSISTENCE_FAILED', '存档尚未恢复，请先点击“备份并恢复布局”')
      if (snapshot.editing) throw new SceneFault('EDITING', '请先完成布局编辑')
    }
    this.demo = enabled; this.demoTimer = 0; this.demoCommandIds = []
    this.officeOptions.onDemoChange?.(enabled)
  }

  protected override afterTick(dt: number) {
    if (this.areActionsReady && this.demo && !this.runtime.isEditing) {
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
        this.officeOptions.onDraftChange?.(error instanceof Error ? error.message : '演示启动失败')
      }
    }
  }
}
