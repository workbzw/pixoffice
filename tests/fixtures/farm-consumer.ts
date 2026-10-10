import type { Container } from 'pixi.js'
import type { ScenePack } from '@pixoffice/runtime'
import type { ScenePresentationPack, SceneAssembly } from '@pixoffice/renderer-pixi'
import { AnimationRegistry } from '@pixoffice/renderer-pixi'
import { FrameAdapter } from '@pixoffice/animation-frame'
import { createFarmScenePack, createFarmClock } from '@pixoffice/scene-farm'
import { createFarmPresentation } from '@pixoffice/scene-farm/pixi'
import { bindFarmFrames } from '@pixoffice/assets-farm'
import type { CharacterManifest } from '@pixoffice/animation-frame/packSchema'

const clock = createFarmClock(), scene: ScenePack = createFarmScenePack(clock.now)
const pack: ScenePresentationPack = createFarmPresentation('https://example.test/farm/', clock.now)
declare const source: CharacterManifest
const assembly: SceneAssembly = { scene, pack, animations: new AnimationRegistry<Container>().register(new FrameAdapter()),
  resolveAppearance: async () => bindFarmFrames(source, 'https://example.test/frames.json') }
void assembly
