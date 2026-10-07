import { OfficeFrameSprite as FrameSprite } from '@pixoffice/assets-office/frame'
import type { AgentState } from '@pixoffice/scene-office/types'
import type { SeatTransition } from '@pixoffice/runtime/model'
import type { CharacterFacing } from '@pixoffice/contracts/facing'
import { getCharacterPack } from '../assets/loadApartmentAssets.ts'
import { apartmentPoseForState, type ApartmentPose } from './apartmentFrames.ts'
import { resolveCharacterClip } from './packSchema.ts'
import { transformWorkSurface, type WorkSurface } from './workSurface.ts'
import { characterPoseClip } from '../../contracts/characterPose.ts'

/** Scene adapter only: clip names are stable; atlas positions belong to the pack. */
export class ApartmentCharacter extends FrameSprite {
  private workSurface?: WorkSurface
  private facing: CharacterFacing = 'front'
  private pose: ApartmentPose = 'idle'
  private elapsed = 0
  private walkingDistance = 0
  private distanceClock = false
  private speechText?: string
  private speechElapsed = 0
  private atDesk = false
  private seatTransition?: SeatTransition
  constructor(characterId: string) {
    super(getCharacterPack(characterId))
    this.renderFrame()
  }
  setAgentColor(color: number) { void color }
  setFacing(direction: 1 | -1) { void direction }
  setAtDesk(atDesk: boolean) { this.atDesk = atDesk }
  setWorkSurface(surface?: WorkSurface) {
    const manifest = this.pack?.manifest
    this.workSurface = surface && manifest ? transformWorkSurface(surface, manifest.referenceHeight / manifest.displayHeight, manifest.pivot.x, manifest.pivot.y) : undefined
  }
  setSeatTransition(transition?: SeatTransition) { this.seatTransition = transition }
  setSpeechText(text?: string) {
    const next = text?.trim() || undefined
    if (next === this.speechText) return
    this.speechText = next; this.speechElapsed = 0; this.renderFrame()
  }
  setViewFacing(facing: CharacterFacing) { if (this.facing !== facing) { this.facing = facing; this.renderFrame() } }
  playState(state: AgentState, customAnimation?: string) {
    const pose = apartmentPoseForState(state, customAnimation, this.atDesk)
    if (this.pose === pose) return
    this.pose = pose; this.elapsed = 0
    if (pose === 'walking') this.walkingDistance = 0
    this.renderFrame()
  }
  playAnimation(animation: string) { this.playState('talking', animation) }
  update(dt: number, distanceMoved?: number) {
    if (distanceMoved != null) {
      this.distanceClock = true
      if (Number.isFinite(distanceMoved) && distanceMoved > 0) this.walkingDistance += distanceMoved
    }
    if (Number.isFinite(dt)) {
      this.elapsed += Math.max(0, dt) * 1000
      if (this.speechText) this.speechElapsed += Math.max(0, dt) * 1000
    }
    this.renderFrame()
  }
  private renderFrame() {
    if (!this.pack) return
    const { manifest } = this.pack
    let name = `emote.${this.pose}`
    if (this.pose === 'walking') name = `walk.${this.facing}`
    else if (this.pose === 'idle') name = `idle.${this.facing}`
    else if (this.pose === 'seated' || this.pose === 'typing') {
      name = characterPoseClip('seated', this.facing)
      if (this.facing === 'back' && this.pose === 'typing') {
        if (manifest.clips['work.quiet-back'] || (manifest.work && this.atDesk && this.workSurface)) name = 'work.quiet-back'
        else if (manifest.clips['work.typing-back'] && !manifest.work) name = 'work.typing-back'
      }
    }
    let elapsed = this.elapsed, progress: number | undefined
    const transition = this.seatTransition
    const speaking = Boolean(this.speechText && !transition && (this.pose === 'idle' || this.pose === 'seated' || this.pose === 'typing'))
    if (speaking && !manifest.mouth) {
      const speech = this.pose === 'seated' || this.pose === 'typing' ? `speak.seated-${this.facing}` : `speak.${this.facing}`
      // Speech is optional per pack; a hidden mouth never rotates the body to fake talking.
      if (manifest.clips[speech]) { name = speech; elapsed = this.speechElapsed }
    }
    if (transition) {
      if (transition.stage === 'rising' || transition.stage === 'sitting') {
        name = transition.stage === 'rising' ? 'stand-up.back' : 'sit-down.back'
        progress = transition.stage === 'rising' ? 1 - transition.seatedAmount : transition.seatedAmount
      } else {
        name = `${['entering', 'exiting'].includes(transition.stage) ? 'walk' : 'idle'}.${this.facing}`
        elapsed = transition.progress * 800
      }
    }
    if (name.startsWith('walk.') && this.distanceClock) {
      const clip = resolveCharacterClip(manifest, name)
      const duration = clip?.frames.reduce((sum, frame) => sum + frame.durationMs, 0) ?? 800
      // One left/right stride spans the same ground distance in every facing and at every frame rate.
      elapsed = this.walkingDistance / (manifest.displayHeight * .72) * duration
    }
    this.renderClip(name, elapsed, progress, speaking ? this.speechElapsed : undefined, this.workSurface)
  }
}
