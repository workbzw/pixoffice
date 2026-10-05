import { createSceneRuntime, type SceneReadPort } from '@pixoffice/runtime'
import { officeScenePack } from '@pixoffice/scene-office'
import { createOfficePresentation } from '@pixoffice/scene-office/pixi'
import { FrameAdapter } from '@pixoffice/animation-frame'
import { SceneView, AnimationRegistry } from '@pixoffice/renderer-pixi'
import type { AnimationAdapter, VisualAssetManifest } from '@pixoffice/contracts'
import type { Container } from 'pixi.js'

const runtime = createSceneRuntime(officeScenePack)
const readPort: SceneReadPort = runtime
const adapter: AnimationAdapter<Container> = new FrameAdapter()
export function assemble(resolveAppearance: (id: string) => Promise<VisualAssetManifest>) {
  return new SceneView({ runtime: readPort, pack: createOfficePresentation(), resolveAppearance,
    animations: new AnimationRegistry<Container>().register(adapter),
    onStep: elapsed => runtime.tick(elapsed), dispatchCommand: command => runtime.submit(command) })
}
