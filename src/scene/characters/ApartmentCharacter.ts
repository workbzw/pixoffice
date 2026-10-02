import { Container, Graphics, Sprite } from 'pixi.js'
import type { AgentState } from '@/types/agent'
import type { SeatTransition } from '@/runtime/model'
import type { CharacterFacing } from './characterFacing'
import { getCharacterPack, type CharacterPack } from '@/scene/assets/loadApartmentAssets'
import { apartmentPoseForState, type ApartmentPose } from './apartmentFrames'
import { resolveCharacterClip, sampleCharacterLayers } from './packSchema'
import { transformWorkSurface, type WorkSurface } from './workSurface'
import { characterPoseClip } from '@/contracts/characterPose'

/** Scene adapter only: clip names are stable; atlas positions belong to the pack. */
export class ApartmentCharacter extends Container {
  private readonly pack: CharacterPack | undefined
  private readonly sprite = new Sprite()
  private readonly mouthSprite = new Sprite()
  private readonly workSprites = Array.from({ length: 6 }, () => new Sprite())
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
  private headY = -88
  private poseError?: string
  constructor(characterId: string) {
    super()
    this.pack = getCharacterPack(characterId)
    this.mouthSprite.visible = false
    for (const part of this.workSprites) part.visible = false
    this.addChild(new Graphics().ellipse(0, 3, 18, 5).fill({ color: 0x000000, alpha: 0.08 }), ...this.workSprites, this.sprite, this.mouthSprite)
    this.renderFrame()
  }
  get isReady() { return Boolean(this.pack) }
  get actionError() { return this.poseError }
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
  getHeadOffsetY() { return this.headY }
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
    const { manifest, textures } = this.pack
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
    const layers = sampleCharacterLayers(manifest, name, elapsed, progress, speaking ? this.speechElapsed : undefined, this.workSurface)
    if (layers && [layers.body.key, ...(layers.mouth ? [layers.mouth.key] : []), ...(layers.work?.parts.map(part => part.key) ?? [])].some(key => !textures.has(key))) {
      this.poseError = `Character action loading: ${name}`
      return
    }
    for (const part of this.workSprites) part.visible = false
    this.poseError = layers ? undefined : `Unsupported character action: ${name}`
    this.sprite.visible = Boolean(layers)
    if (!layers) { this.mouthSprite.visible = false; return }
    const { body: sample, mouth, work } = layers
    const texture = textures.get(sample.key)
    if (!texture) return
    const scale = manifest.displayHeight / manifest.referenceHeight
    this.sprite.texture = texture
    this.sprite.anchor.set(manifest.pivot.x / manifest.canvas.width, manifest.pivot.y / manifest.canvas.height)
    this.sprite.scale.set(sample.clip.mirrorX ? -scale : scale, scale)
    work?.parts.forEach((part, index) => {
      const sprite = this.workSprites[index], texture = textures.get(part.key)
      if (!sprite || !texture) return
      sprite.visible = true; sprite.texture = texture
      sprite.anchor.set(part.root.x / manifest.canvas.width, part.root.y / manifest.canvas.height)
      sprite.position.set((part.position.x - manifest.pivot.x) * scale, (part.position.y - manifest.pivot.y) * scale)
      sprite.scale.set(scale * part.mirror, scale); sprite.rotation = part.rotation
    })
    const mouthTexture = mouth && textures.get(mouth.key)
    this.mouthSprite.visible = Boolean(mouth && mouthTexture)
    if (mouth && mouthTexture) {
      const { attachment, pivot } = mouth
      const mirror = sample.clip.mirrorX ? -1 : 1
      this.mouthSprite.texture = mouthTexture
      this.mouthSprite.anchor.set(pivot.x / manifest.canvas.width, pivot.y / manifest.canvas.height)
      this.mouthSprite.position.set((attachment.x - manifest.pivot.x) * scale * mirror, (attachment.y - manifest.pivot.y) * scale)
      this.mouthSprite.scale.set(scale * attachment.scale * mirror * (mouth.clip.mirrorX ? -1 : 1), scale * attachment.scale)
      this.mouthSprite.rotation = attachment.rotation * Math.PI / 180 * mirror
    }
    // Alpha-trim bounds vary between pictures; loop labels stay on the clip's reference frame.
    const labelFrame = sample.clip.loop ? manifest.frames[sample.clip.frames[0].frame] : sample.frame
    this.headY = (labelFrame.offset.y - manifest.pivot.y) * scale - 4
  }
}
