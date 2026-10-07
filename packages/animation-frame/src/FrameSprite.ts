import { Container, Graphics, Sprite } from 'pixi.js'
import type { CharacterPackResources } from './CharacterPackResources.ts'
import { sampleCharacterLayers, type CharacterManifest } from './packSchema.ts'

/** Frame rendering only; action choice and clocks belong to the caller. */
export class FrameSprite<T extends CharacterManifest = CharacterManifest> extends Container {
  protected pack: CharacterPackResources<T> | undefined
  protected readonly sprite = new Sprite()
  protected readonly mouthSprite = new Sprite()
  protected headY = -88
  protected poseError?: string

  constructor(pack?: CharacterPackResources<T>) {
    super()
    this.pack = pack
    this.mouthSprite.visible = false
    this.addChild(new Graphics().ellipse(0, 3, 18, 5).fill({ color: 0x000000, alpha: 0.08 }), this.sprite, this.mouthSprite)
  }
  get isReady() { return Boolean(this.pack) }
  get actionError() { return this.poseError }
  getHeadOffsetY() { return this.headY }

  renderClip(name: string, elapsed = 0, progress?: number, speechElapsedMs?: number) {
    if (this.pack) this.renderLayers(sampleCharacterLayers(this.pack.manifest, name, elapsed, progress, speechElapsedMs), name)
  }
  protected renderLayers(layers: ReturnType<typeof sampleCharacterLayers>, name: string) {
    if (!this.pack) return
    const { manifest, textures } = this.pack
    if (layers && [layers.body.key, ...(layers.mouth ? [layers.mouth.key] : [])].some(key => !textures.has(key))) {
      this.poseError = `Character action loading: ${name}`
      return
    }
    this.poseError = layers ? undefined : `Unsupported character action: ${name}`
    this.sprite.visible = Boolean(layers)
    if (!layers) { this.mouthSprite.visible = false; return }
    const { body: sample, mouth } = layers
    const texture = textures.get(sample.key)
    if (!texture) return
    const scale = manifest.displayHeight / manifest.referenceHeight
    this.sprite.texture = texture
    this.sprite.anchor.set(manifest.pivot.x / manifest.canvas.width, manifest.pivot.y / manifest.canvas.height)
    this.sprite.scale.set(sample.clip.mirrorX ? -scale : scale, scale)
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
