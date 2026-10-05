import { Container, Graphics, Sprite } from 'pixi.js'
import type { CharacterPackResources } from './CharacterPackResources.ts'
import { sampleCharacterLayers } from './packSchema.ts'
import type { WorkSurface } from '@pixoffice/contracts/contactSurface'

/** Frame rendering only; action choice and clocks belong to the caller. */
export class FrameSprite extends Container {
  protected pack: CharacterPackResources | undefined
  protected readonly sprite = new Sprite()
  protected readonly mouthSprite = new Sprite()
  protected readonly workSprites = Array.from({ length: 6 }, () => new Sprite())
  protected headY = -88
  protected poseError?: string

  constructor(pack?: CharacterPackResources) {
    super()
    this.pack = pack
    this.mouthSprite.visible = false
    for (const part of this.workSprites) part.visible = false
    this.addChild(new Graphics().ellipse(0, 3, 18, 5).fill({ color: 0x000000, alpha: 0.08 }), ...this.workSprites, this.sprite, this.mouthSprite)
  }
  get isReady() { return Boolean(this.pack) }
  get actionError() { return this.poseError }
  getHeadOffsetY() { return this.headY }

  renderClip(name: string, elapsed = 0, progress?: number, speechElapsedMs?: number, workSurface?: WorkSurface) {
    if (!this.pack) return
    const { manifest, textures } = this.pack
    const layers = sampleCharacterLayers(manifest, name, elapsed, progress, speechElapsedMs, workSurface)
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
