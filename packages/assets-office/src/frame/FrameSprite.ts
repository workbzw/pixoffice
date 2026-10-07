import { Sprite } from 'pixi.js'
import { FrameSprite as BaseFrameSprite } from '@pixoffice/animation-frame/FrameSprite'
import type { WorkSurface } from '@pixoffice/contracts/contactSurface'
import type { CharacterPackResources } from './resources.ts'
import { sampleCharacterLayers, type CharacterManifest } from './packSchema.ts'

/** Compatibility for legacy office previews. Published office work uses complete body frames. */
export class FrameSprite extends BaseFrameSprite<CharacterManifest> {
  protected readonly workSprites = Array.from({ length: 6 }, () => new Sprite())
  constructor(pack?: CharacterPackResources) {
    super(pack)
    this.workSprites.forEach((sprite, index) => { sprite.visible = false; this.addChildAt(sprite, index + 1) })
  }
  override renderClip(name: string, elapsed = 0, progress?: number, speechElapsedMs?: number, workSurface?: WorkSurface) {
    if (!this.pack) return
    const { manifest, textures } = this.pack
    const layers = sampleCharacterLayers(manifest, name, elapsed, progress, speechElapsedMs, workSurface)
    const keys = layers ? [layers.body.key, ...(layers.mouth ? [layers.mouth.key] : []), ...(layers.work?.parts.map(part => part.key) ?? [])] : []
    if (keys.some(key => !textures.has(key))) { this.poseError = `Character action loading: ${name}`; return }
    this.workSprites.forEach(sprite => { sprite.visible = false })
    this.renderLayers(layers, name)
    const scale = manifest.displayHeight / manifest.referenceHeight
    layers?.work?.parts.forEach((part, index) => {
      const sprite = this.workSprites[index], texture = textures.get(part.key)
      if (!sprite || !texture) return
      sprite.visible = true; sprite.texture = texture
      sprite.anchor.set(part.root.x / manifest.canvas.width, part.root.y / manifest.canvas.height)
      sprite.position.set((part.position.x - manifest.pivot.x) * scale, (part.position.y - manifest.pivot.y) * scale)
      sprite.scale.set(scale * part.mirror, scale); sprite.rotation = part.rotation
    })
  }
}
