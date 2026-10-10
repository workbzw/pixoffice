import type { Container, Texture } from 'pixi.js'
import type { SceneReadPort } from '@pixoffice/runtime'
import type { World, Point } from '@pixoffice/runtime/model'
import type { PresentedActor } from '@pixoffice/contracts/presentation'
import type { PropViewRegistry } from './PropViewRegistry.ts'

/** Scene-local decoration, outside actor commands and resource reservations. */
export interface SceneAmbientView {
  readonly roots: Container[]
  update(elapsedSeconds: number, world: World): void
  dispose?(): void
}

export interface ScenePresentationPack {
  readonly id: string
  readonly cellPixels: number
  readonly resourceCount: number
  loadBackground(): Promise<Texture | null>
  loadObjects(report: (resource: string) => void): Promise<void>
  createPropViews(): PropViewRegistry
  createAmbientViews?(runtime: SceneReadPort): SceneAmbientView[]
  projectActors(runtime: SceneReadPort, preview?: World): PresentedActor[]
  cellCenter(point: Point): Point
}
