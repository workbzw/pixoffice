import type { EntityPresentation, VisualAssetManifest, VisualRequest } from '@pixoffice/contracts/animation'
import { assessVisualRequest } from '@pixoffice/contracts/animationSupport'
import type { ActorIntent, PresentedActor } from '@pixoffice/contracts/presentation'

export function resolveVisualRequest(manifest: VisualAssetManifest, intent: ActorIntent): VisualRequest {
  const find = (action: string) => manifest.capabilities.variants.find(v => v.actionId === action && v.poseId === intent.poseId && v.view === intent.view)
  const base = find(intent.actionId)
  if (!base) throw new Error(`Unsupported action: ${manifest.asset.id} / ${intent.actionId}.${intent.poseId}.${intent.view}`)
  const speech = intent.speech && find('core.speak')
  const request = { poseId: intent.poseId, view: intent.view, variantIds: [base.variantId, ...(speech ? [speech.variantId] : [])], contactProfileId: intent.contactProfileId }
  const support = assessVisualRequest(manifest, request)
  if (!support.supported) throw new Error(`Unsupported action combination: ${support.missing.join(', ')}`)
  return request
}

/** Host-controlled clocks. Direction changes preserve gait phase; action changes restart it. */
export class AnimationPresenter {
  private action = ''
  private elapsedMs = 0
  private travelledDu = 0
  private generation = 0
  private speech = ''
  private speechMs = 0
  private speechGeneration = 0
  private previousPosition?: PresentedActor['position']

  sample(actor: PresentedActor, manifest: VisualAssetManifest, dt: number): EntityPresentation {
    const intent = actor.intent, key = `${intent.actionId}:${intent.poseId}`, ms = Math.max(0, Number.isFinite(dt) ? dt * 1000 : 0)
    if (this.action !== key) { this.action = key; this.elapsedMs = 0; this.travelledDu = 0; this.generation++ }
    if (this.speech !== (intent.speech ?? '')) { this.speech = intent.speech ?? ''; this.speechMs = 0; this.speechGeneration++ }
    this.elapsedMs += ms
    if (this.speech) this.speechMs += ms
    if (intent.actionId === 'core.walk' && this.previousPosition) this.travelledDu += Math.hypot(actor.position.x - this.previousPosition.x, actor.position.y - this.previousPosition.y) / actor.displayHeight
    this.previousPosition = { ...actor.position }
    const request = resolveVisualRequest(manifest, intent)
    return { entityId: actor.id, request, contacts: intent.contacts ?? [], actions: request.variantIds.map(variantId => {
      const speech = manifest.capabilities.variants.find(v => v.variantId === variantId)?.channel === 'speech'
      return { variantId, instanceId: `${actor.id}:${speech ? 'speech' : 'body'}:${speech ? this.speechGeneration : this.generation}`,
        clock: speech ? { mode: 'time', elapsedMs: this.speechMs, loop: true }
          : intent.progress !== undefined ? { mode: 'progress', progress: intent.progress }
          : intent.actionId === 'core.walk' ? { mode: 'distance', travelledDu: this.travelledDu, strideDu: .72 }
          : { mode: 'time', elapsedMs: this.elapsedMs, loop: true } }
    }) }
  }
}
