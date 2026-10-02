import type { Texture } from 'pixi.js'
import { loadOfficeTexture } from './loadOfficeTexture'

let backgroundTexture: Texture | null = null
let deskTexture: Texture | null = null
let chairTexture: Texture | null = null

export function getOfficeBackgroundTexture(): Texture | null {
  return backgroundTexture
}

export function getOfficeDeskTexture(): Texture | null {
  return deskTexture
}

export function getOfficeChairTexture(): Texture | null {
  return chairTexture
}

export function isOfficeAssetsReady(): boolean {
  return deskTexture != null && chairTexture != null
}

export async function loadOfficeBackground(): Promise<Texture | null> {
  try { backgroundTexture = await loadOfficeTexture('office-background', 'office', true) }
  catch (error) {
    backgroundTexture = null
    console.warn('[Office] 办公室背景加载失败，将使用纯色底', error)
  }
  return backgroundTexture
}

export async function loadOfficeFurniture(onLoaded?: (part: 'desk' | 'chair') => void): Promise<boolean> {
  const results = await Promise.allSettled((['desk', 'chair'] as const).map(async part => {
    const texture = await loadOfficeTexture(`office-${part}`, part)
    onLoaded?.(part)
    return texture
  }))
  if (results[0].status === 'fulfilled' && results[1].status === 'fulfilled') {
    deskTexture = results[0].value; chairTexture = results[1].value
    return true
  }
  deskTexture = null; chairTexture = null
  console.warn('[Office] 工位素材加载失败，将使用矢量回退', results)
  return false
}

export async function loadOfficeAssets(): Promise<boolean> {
  const [, furniture] = await Promise.all([loadOfficeBackground(), loadOfficeFurniture()])
  return furniture
}
