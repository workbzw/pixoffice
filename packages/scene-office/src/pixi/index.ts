import type { ScenePresentationPack } from '@pixoffice/renderer-pixi/ScenePresentationPack'
import type { ActorIntent } from '@pixoffice/contracts/presentation'
import { projectAgents } from '../adapters/office.ts'
import { apartmentPoseForState } from './posePolicy.ts'
import { loadOfficeBackground, loadOfficeFurniture } from './assets/loadOfficeAssets.ts'
import { loadWorkstationTrialAssets } from './assets/loadWorkstationTrialAssets.ts'
import { createOfficePropViews } from './views/index.ts'
import { CELL_PIXELS, cellCenter } from './projection.ts'
import { computeAgentDepthZ } from './depth.ts'
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
      return projectAgents(runtime, false, preview).map(agent => {
        const pose = apartmentPoseForState(agent.state, agent.customAnimation, Boolean(agent.seated && !agent.customAnimation && agent.state !== 'walking'))
        const seated = pose === 'seated' || pose === 'typing', view = agent.viewFacing ?? 'front'
        const intent: ActorIntent = { actionId: pose === 'walking' ? 'core.walk' : pose === 'typing' && view === 'back' ? 'office.type'
          : ['idle', 'seated', 'typing'].includes(pose) ? 'core.idle' : `core.emote.${pose}`,
          poseId: seated ? 'seated' : 'standing', view,
          speech: ['idle', 'seated', 'typing'].includes(pose) && !agent.seatTransition ? agent.bubbleText : undefined,
          contactProfileId: seated ? 'office-desk-v1' : undefined }
        const transition = agent.seatTransition
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
