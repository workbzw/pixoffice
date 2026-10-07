import { mountScene, type SceneAssembly } from '@pixoffice/renderer-pixi'
import { FrameAdapter } from '@pixoffice/animation-frame'
import type { AnimationAdapter } from '@pixoffice/contracts'
import type { Container } from 'pixi.js'
export const adapter: AnimationAdapter<Container> = new FrameAdapter()
export const mount = (host: HTMLElement, load: (signal: AbortSignal) => Promise<SceneAssembly>) => mountScene(host, load)
