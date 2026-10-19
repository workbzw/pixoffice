import type { Container, Texture } from 'pixi.js'
import type { SceneReadPort } from '@pixoffice/runtime'
import type { World, Point } from '@pixoffice/runtime/model'
import type { PresentedActor } from '@pixoffice/contracts/presentation'
import type { PropViewRegistry } from './PropViewRegistry.ts'
import type { SceneProjection, SceneRenderProfile, ScreenBounds } from '@pixoffice/contracts/projection'

/** Scene-local decoration, outside actor commands and resource reservations. */
export interface SceneAmbientView {
  readonly roots: Container[]
  update(elapsedSeconds: number, world: World): void
  dispose?(): void
}

export interface ScenePresentationPack {
  readonly id: string
  readonly cellPixels: number
  /** Omitted by existing packs: the original square-grid projection remains the default. */
  readonly projection?: SceneProjection
  readonly rendering?: SceneRenderProfile
  contentBounds?(world: World): ScreenBounds
  readonly resourceCount: number
  loadBackground(): Promise<Texture | null>
  loadObjects(report: (resource: string) => void): Promise<void>
  createPropViews(): PropViewRegistry
  createAmbientViews?(runtime: SceneReadPort): SceneAmbientView[]
  /** Reuse the renderer's world snapshot, including draft state while editing. */
  projectActors(runtime: SceneReadPort, world?: World): PresentedActor[]
  cellCenter(point: Point): Point
}
