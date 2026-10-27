import type { ScenePresentationPack } from '@pixoffice/renderer-pixi/ScenePresentationPack'
import type { ActorIntent, ActorTaskPresentation } from '@pixoffice/contracts/presentation'
import { projectAgents } from '../adapters/office.ts'
import { apartmentPoseForState } from './posePolicy.ts'
import { loadOfficeBackground, loadOfficeFurniture } from './assets/loadOfficeAssets.ts'
import { loadWorkstationTrialAssets } from './assets/loadWorkstationTrialAssets.ts'
import { createOfficePropViews } from './views/index.ts'
import { CELL_PIXELS, cellCenter } from './projection.ts'
import { computeAgentDepthZ } from './depth.ts'
import { loadReferenceOfficeBackground, loadReferenceOfficeObjects } from './assets/loadReferenceOfficeAssets.ts'
import { createReferenceOfficePropViews, referenceMonitorAnchor } from './views/referenceOffice.ts'
import type { WhiteboardProgress } from '../whiteboard.ts'
import { createOfficeWorkEffects } from './effects/OfficeWorkEffect.ts'
import { loadOfficeTexture } from './assets/loadOfficeTexture.ts'
import type { Texture } from 'pixi.js'
export { configureOfficeAssets } from './assets/loadOfficeTexture.ts'

export function createOfficePresentation(trialEnabled: () => boolean = () => true): ScenePresentationPack {
  return {
    id: 'pixoffice.office', cellPixels: CELL_PIXELS, resourceCount: 6, cellCenter,
    loadBackground: loadOfficeBackground,
    async loadObjects(report) {
      await Promise.all([loadOfficeFurniture(part => report(`furniture:${part}`)), loadWorkstationTrialAssets(part => report(`workstation:${part}`))])
    },
    createPropViews: () => createOfficePropViews(trialEnabled),
    projectActors(runtime, preview) {
      const busy = new Set(runtime.readActivePhases().flatMap(phase => phase.participants))
      for (const actor of preview?.actors ?? runtime.readActors()) {
        if (actor.motion || actor.step || actor.seatTransition || actor.presentation.status !== 'idle') busy.add(actor.id)
      }
      return projectAgents(runtime, false, preview).map(agent => {
        const pose = apartmentPoseForState(agent.state, agent.customAnimation, Boolean(agent.seated && !agent.customAnimation && agent.state !== 'walking'))
        const seated = pose === 'seated' || pose === 'typing', view = agent.viewFacing ?? 'front'
        const intent: ActorIntent = { actionId: pose === 'walking' ? 'core.walk' : pose === 'typing' && view === 'back' ? 'office.type'
          : ['idle', 'seated', 'typing'].includes(pose) ? 'core.idle' : `core.emote.${pose}`,
          poseId: seated ? 'seated' : 'standing', view,
          speech: ['idle', 'seated', 'typing'].includes(pose) && !agent.seatTransition ? agent.bubbleText : undefined,
          contactProfileId: seated ? 'office-desk-v1' : undefined }
        const transition = agent.seatTransition
        if (agent.state === 'idle' && !agent.bubbleText && !transition && !busy.has(agent.id) && !runtime.isEditing) intent.actionId = 'core.leisure'
        if (transition) {
          const posture = transition.stage === 'rising' || transition.stage === 'sitting'
          intent.actionId = posture ? transition.stage === 'rising' ? 'core.stand-up' : 'core.sit-down' : ['entering', 'exiting'].includes(transition.stage) ? 'core.walk' : 'core.idle'
          intent.poseId = posture ? 'transition' : 'standing'
          intent.progress = posture ? transition.stage === 'rising' ? 1 - transition.seatedAmount : transition.seatedAmount : undefined
          intent.contactProfileId = undefined
        }
        return { id: agent.id, appearanceId: agent.appearanceId ?? agent.id, name: agent.name, position: { x: agent.x, y: agent.y }, depth: computeAgentDepthZ(agent), displayHeight: 84,
          intent, status: agent.state, title: agent.state === 'working' || agent.state === 'thinking' ? agent.currentTask : undefined,
          furniture: agent.assignedDeskId ? { propId: agent.assignedDeskId, seated: Boolean(agent.seated), transitioning: Boolean(transition) } : undefined,
          bubble: agent.bubbleText,
        }
      })
    },
  }
}

export function createReferenceOfficePresentation(options: { taskForActor?: (id: string) => ActorTaskPresentation | undefined; whiteboardProgress?: WhiteboardProgress; workEffects?: boolean } = {}): ScenePresentationPack {
  const base = createOfficePresentation()
  const workEffects = options.workEffects ?? false
  let workEffectTexture: Texture | undefined
  const pack: ScenePresentationPack = { ...base, id: 'pixoffice.office.reference', resourceCount: workEffects ? 9 : 8,
    rendering: { idleFPS: 20, motionFPS: 60 },
    contentBounds: () => ({ left: 0, top: 0, right: 1100, bottom: 850 }),
    loadBackground: loadReferenceOfficeBackground,
    async loadObjects(report) {
      await Promise.all([base.loadObjects(report), loadReferenceOfficeObjects(part => report(`reference:${part}`)),
        workEffects ? loadOfficeTexture('office-work-crafting-lite-v1', 'effects/work-crafting-lite-v1').then(texture => { workEffectTexture = texture; report('office-work-crafting-lite-v1') }) : undefined])
    },
    createPropViews: () => createReferenceOfficePropViews(options.whiteboardProgress),
    projectActors(runtime, preview) {
      const world = preview ?? runtime.readWorld(), props = world.props
      return base.projectActors(runtime, world).map(actor => {
        const supplied = options.taskForActor?.(actor.id)
        const task: ActorTaskPresentation = supplied && (!actor.title || supplied.title === actor.title) ? supplied
          : actor.title ? { title: actor.title, status: actor.status === 'thinking' ? 'blocked' : 'running', progressMode: 'activity' }
          : { title: '待命', status: 'idle' }
        const workstation = props.find(prop => prop.id === actor.furniture?.propId && prop.templateId === 'office.reference-workstation')
        const presented = { ...actor, displayHeight: 126, label: { placement: 'above' as const, scale: 1.25 }, task,
          taskAnchor: workstation ? { ...referenceMonitorAnchor(workstation.position, 'right'), placement: 'right' as const } : undefined }
        return presented
      })
    },
  }
  if (workEffects) pack.createAmbientViews = runtime => {
    if (!workEffectTexture) throw new Error('Load the office crafting atlas before mounting the work effect')
    return [createOfficeWorkEffects(workEffectTexture, runtime, runtime.readActors().map(actor => actor.id), world => pack.projectActors(runtime, world))]
  }
  return pack
}
