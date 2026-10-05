import type { Texture } from 'pixi.js'
import type { SceneReadPort } from '@pixoffice/runtime'
import type { World, Point } from '@pixoffice/runtime/model'
import type { PresentedActor } from '@pixoffice/contracts/presentation'
import type { PropViewRegistry } from './PropViewRegistry.ts'

export interface ScenePresentationPack {
  readonly id: string
  readonly cellPixels: number
  readonly resourceCount: number
  loadBackground(): Promise<Texture | null>
  loadObjects(report: (resource: string) => void): Promise<void>
  createPropViews(): PropViewRegistry
  projectActors(runtime: SceneReadPort, preview?: World): PresentedActor[]
  cellCenter(point: Point): Point
}
