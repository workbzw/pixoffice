import { Assets, type Texture } from 'pixi.js'

const parts = ['desk', 'chair', 'computer'] as const
type TrialTextures = Record<(typeof parts)[number], Texture>
let textures: TrialTextures | undefined

export function getWorkstationTrialTextures() { return textures }

export async function loadWorkstationTrialAssets() {
  if (textures) return true
  try {
    const loaded = {} as TrialTextures
    for (const part of parts) {
      const alias = `office-workstation-trial-v1-${part}`
      if (!Assets.resolver.hasKey(alias)) Assets.add({ alias, src: `/assets/office/workstation-trial-v1/${part}.png` })
      const texture = await Assets.load<Texture>(alias)
      if (!texture?.source) throw new Error(`Invalid workstation texture: ${part}`)
      texture.source.scaleMode = 'linear'
      loaded[part] = texture
    }
    textures = loaded
    return true
  } catch (error) {
    console.warn('[Office] 新桌椅加载失败，保留原桌椅', error)
    return false
  }
}
