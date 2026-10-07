import type { Container } from 'pixi.js'
import type { ScenePack } from '@pixoffice/runtime'
import type { ScenePresentationPack, SceneAssembly } from '@pixoffice/renderer-pixi'
import { AnimationRegistry } from '@pixoffice/renderer-pixi'
import { FrameAdapter } from '@pixoffice/animation-frame'
import { classroomScenePack } from '@pixoffice/scene-classroom'
import { createClassroomPresentation } from '@pixoffice/scene-classroom/pixi'
import { bindClassroomFrames } from '@pixoffice/assets-classroom'
import type { CharacterManifest } from '@pixoffice/animation-frame/packSchema'

const scene: ScenePack = classroomScenePack
const pack: ScenePresentationPack = createClassroomPresentation('https://example.test/classroom/')
declare const source: CharacterManifest
const assembly: SceneAssembly = { scene, pack, animations: new AnimationRegistry<Container>().register(new FrameAdapter()),
  resolveAppearance: async () => bindClassroomFrames(source, 'https://example.test/frames.json') }
void assembly
