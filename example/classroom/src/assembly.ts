import { Container } from 'pixi.js'
import { AnimationRegistry, createAppearanceResolver } from '@pixoffice/renderer-pixi'
import type { SceneAssembly } from '@pixoffice/renderer-pixi'
import { FrameAdapter } from '@pixoffice/animation-frame'
import { classroomScenePack } from '@pixoffice/scene-classroom'
import { createClassroomPresentation } from '@pixoffice/scene-classroom/pixi'
import { classroomAppearanceIds } from '@pixoffice/assets-classroom'

export function createClassroomAssembly(assetBaseUrl: string, signal: AbortSignal): SceneAssembly {
  return {
    scene: classroomScenePack, pack: createClassroomPresentation(assetBaseUrl),
    animations: new AnimationRegistry<Container>().register(new FrameAdapter()),
    resolveAppearance: createAppearanceResolver(id => {
      if (!classroomAppearanceIds.some(known => known === id)) throw new Error(`Unknown classroom appearance: ${id}`)
      return new URL(`${id}/visual.json`, assetBaseUrl).href
    }, signal),
  }
}
