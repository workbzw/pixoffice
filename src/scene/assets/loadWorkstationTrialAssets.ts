import type { Texture } from 'pixi.js'
import { loadOfficeTexture } from './loadOfficeTexture'

const parts = ['desk', 'chair', 'computer'] as const
type TrialTextures = Record<(typeof parts)[number], Texture>
let textures: TrialTextures | undefined

export function getWorkstationTrialTextures() { return textures }

export async function loadWorkstationTrialAssets(onLoaded?: (part: typeof parts[number]) => void) {
  if (textures) { parts.forEach(part => onLoaded?.(part)); return true }
  try {
    const loaded = {} as TrialTextures
    const results = await Promise.allSettled(parts.map(async part => {
      const alias = `office-workstation-trial-v1-${part}`
      loaded[part] = await loadOfficeTexture(alias, `workstation-trial-v1/${part}`)
      onLoaded?.(part)
    }))
    const failed = results.find(result => result.status === 'rejected')
    if (failed?.status === 'rejected') throw failed.reason
    textures = loaded
    return true
  } catch (error) {
    console.warn('[Office] 新桌椅加载失败，保留原桌椅', error)
    return false
  }
}
