import { Assets, type Texture } from 'pixi.js'
import { textureLoadQueue } from './AssetLoadQueue'

export function loadOfficeTexture(alias: string, name: string, background = false): Promise<Texture> {
  if (!Assets.resolver.hasKey(alias)) Assets.add({ alias, src: `/assets/office/${name}.webp` })
  const load = async () => {
    let texture: Texture
    try { texture = await Assets.load<Texture>(alias) }
    catch { texture = await Assets.load<Texture>(`/assets/office/${name}.png`) }
    if (!texture?.source) throw new Error(`Invalid office texture: ${name}`)
    texture.source.scaleMode = 'linear'
    return texture
  }
  // The background must not wait behind sidebar character downloads.
  return background ? load() : textureLoadQueue.run(load)
}
