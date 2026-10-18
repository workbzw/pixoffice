import { mountScene, type SceneAssembly } from '@pixoffice/renderer-pixi'
import { FrameAdapter } from '@pixoffice/animation-frame'
import type { AnimationAdapter } from '@pixoffice/contracts'
import type { Container } from 'pixi.js'
import type { SceneCommand } from '@pixoffice/protocol'
import type { SceneProjection } from '@pixoffice/contracts/projection'
import { createDimetricProjection } from '@pixoffice/renderer-pixi/projection'
export const adapter: AnimationAdapter<Container> = new FrameAdapter()
export const mount = (host: HTMLElement, load: (signal: AbortSignal) => Promise<SceneAssembly>) => mountScene(host, load)
export const projection: SceneProjection = createDimetricProjection()
export const commandId = (command: SceneCommand) => command.commandId
