import { SceneView } from '@pixoffice/renderer-pixi/SceneView'
import type { SceneRuntime } from '@pixoffice/runtime'
import type { Container } from 'pixi.js'
import type { SceneViewOptions, SceneLoadProgress, SceneActionProgress } from '@pixoffice/renderer-pixi/SceneView'
import { AnimationRegistry } from '@pixoffice/renderer-pixi/animation/AnimationRegistry'
import { characterAssets } from '@pixoffice/assets-office/frame/resources'
import { FrameAdapter } from '@pixoffice/animation-frame/FrameAdapter'
import { createOfficePresentation, createReferenceOfficePresentation } from '@pixoffice/scene-office/pixi'
import { resolveOfficeAppearance } from './officeFrames.ts'
import { supportsOfficePose } from '@pixoffice/scene-office/core/poseSupport'
import type { VisualAssetManifest } from '@pixoffice/contracts/animation'
import type { ActorTaskPresentation } from '@pixoffice/contracts/presentation'
import { createOfficeRuntime } from './createOfficeRuntime.ts'
import { commandBase, presentationCommand, projectAgents, visitCommand } from '@pixoffice/scene-office/adapters/office'
import { OfficeSimulation } from './OfficeSimulation.ts'
import { OfficeDemoSource } from '../dashboard/OfficeDemoSource.ts'
import type { Agent, AgentState } from '@pixoffice/scene-office/types'
import type { WhiteboardProgress } from '@pixoffice/scene-office/whiteboard'

export type { SceneLoadProgress, SceneActionProgress }
export type OfficeAgentClick = { agent: Agent; rosterNo: number; clientX: number; clientY: number }
export type OfficeSceneOptions = Partial<Pick<SceneViewOptions, 'animations' | 'resolveAppearance' | 'propViews' | 'onPropClick'>> & {
  runtime?: SceneRuntime
  simulation?: OfficeSimulation
  onAgentClick?: (event: OfficeAgentClick) => void
  taskForActor?: (id: string) => ActorTaskPresentation | undefined
  whiteboardProgress?: WhiteboardProgress
  onDraftChange?: (error: string | null) => void
  onDemoChange?: (enabled: boolean) => void
  onLoadProgress?: (progress: SceneLoadProgress) => void
  onActionProgress?: (progress: SceneActionProgress) => void
}

/** Office application facade; the renderer and animation adapters have no office dependency. */
export class OfficeScene extends SceneView {
  declare readonly runtime: SceneRuntime
  private ownsRuntime: boolean
  private artwork: { enabled: boolean }
  private simulation: OfficeSimulation
  private unsubscribeSimulation: () => void

  constructor(options: OfficeSceneOptions = {}) {
    const artwork = { enabled: true }, manifests = new Map<string, VisualAssetManifest>()
    const runtime = options.simulation?.runtime ?? options.runtime ?? createOfficeRuntime({ supportsPose: (id, posture, facing) => {
      const manifest = manifests.get(id)
      return manifest ? manifest.capabilities.variants.some(v => v.actionId === 'core.idle' && v.poseId === posture && v.view === facing)
        : supportsOfficePose(id, posture, facing)
    } })
    const simulation = options.simulation ?? new OfficeSimulation(runtime, new OfficeDemoSource(runtime))
    super({
      ...options, runtime,
      onStep: options.simulation ? undefined : elapsedMs => { simulation.tick(elapsedMs); simulation.demoSource?.tick(elapsedMs) },
      dispatchCommand: command => runtime.submit(command),
      pack: runtime.readWorld().props.some(prop => prop.templateId === 'office.wall-whiteboard') ? createReferenceOfficePresentation({ taskForActor: options.taskForActor, whiteboardProgress: options.whiteboardProgress }) : createOfficePresentation(() => artwork.enabled),
      animations: options.animations ?? new AnimationRegistry<Container>().register(new FrameAdapter(manifest => characterAssets.acquire(manifest.asset.id, manifest.source.uri))),
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
    this.artwork = artwork; this.ownsRuntime = !options.runtime && !options.simulation
    this.simulation = simulation
    this.unsubscribeSimulation = simulation.subscribe(() => {
      options.onDemoChange?.(simulation.isDemoRunning)
      if (simulation.error) options.onDraftChange?.(simulation.error)
    })
  }
  protected override onDestroy() {
    this.unsubscribeSimulation()
    if (this.ownsRuntime) {
      try { if (this.runtime.isEditing) this.cancelEditing() }
      finally { this.runtime.dispose() }
    }
  }
  protected override beforeEditing() { this.setDemo(false) }
  getAgents() { return projectAgents(this.runtime) }
  requestDeskVisit(visitor: number, host: number, message: string) { this.requireActions(); return this.runtime.submit(visitCommand(this.runtime, visitor, [host], () => message)) }
  requestDeskVisitTour(visitor: number, hosts: number[], message?: (no: number, name: string) => string) { this.requireActions(); return this.runtime.submit(visitCommand(this.runtime, visitor, hosts, message ?? ((_, name) => `${name}，请接手下一步。`))) }
  setAgentState(id: string, state: AgentState, task?: string) { this.requireActions(); return this.runtime.submit(presentationCommand(this.runtime, id, state, task)) }
  playAgentAnimation(id: string, animation: string) { this.requireActions(); return this.runtime.submit({ ...commandBase(this.runtime), type: 'activity.start', capability: 'office.emote', participants: [{ entityId: id, role: 'actor' }], params: { animation } }) }
  get isDemoRunning() { return this.simulation.isDemoRunning }
  setWorkstationTrial(enabled: boolean) {
    this.artwork.enabled = enabled
    this.refresh()
  }
  setDemo(enabled: boolean) {
    if (enabled) this.requireActions()
    this.simulation.setDemo(enabled)
  }
}
