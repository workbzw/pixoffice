import { Container } from 'pixi.js'
import { AnimationRegistry, createAppearanceResolver } from '@pixoffice/renderer-pixi'
import type { SceneAssembly } from '@pixoffice/renderer-pixi'
import { FrameAdapter } from '@pixoffice/animation-frame'
import { createFarmScenePack } from '@pixoffice/scene-farm'
import { createFarmPresentation } from '@pixoffice/scene-farm/pixi'
import { farmAppearanceIds } from '@pixoffice/assets-farm'
export function createFarmAssembly(assetBaseUrl: string, now: () => number, signal: AbortSignal): SceneAssembly {
  return { scene: createFarmScenePack(now), pack: createFarmPresentation(assetBaseUrl, now), animations: new AnimationRegistry<Container>().register(new FrameAdapter()),
    resolveAppearance: createAppearanceResolver(id => {
      if (!farmAppearanceIds.some(known => known === id)) throw new Error(`Unknown farm appearance: ${id}`)
      return new URL(`${id}/visual.json`, assetBaseUrl).href
    }, signal) }
}
