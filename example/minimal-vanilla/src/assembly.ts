import { AnimationRegistry, createAppearanceResolver } from '@pixoffice/renderer-pixi'
import type { SceneAssembly } from '@pixoffice/renderer-pixi'
import { FrameAdapter } from '@pixoffice/animation-frame'
import { characterAssets } from '@pixoffice/assets-office/frame/resources'
import { officeScenePack } from '@pixoffice/scene-office'
import { createOfficePresentation, configureOfficeAssets } from '@pixoffice/scene-office/pixi'
import type { Container } from 'pixi.js'

export function createAssembly(signal: AbortSignal): SceneAssembly {
  configureOfficeAssets({ baseUrl: `${import.meta.env.BASE_URL}assets/office` })
  return { scene: officeScenePack, pack: createOfficePresentation(),
    animations: new AnimationRegistry<Container>().register(new FrameAdapter(manifest => characterAssets.acquire(manifest.asset.id, manifest.source.uri))),
    resolveAppearance: createAppearanceResolver(id => new URL(`${import.meta.env.BASE_URL}characters/visuals/${encodeURIComponent(id)}.json`, document.baseURI).href, signal),
  }
}
