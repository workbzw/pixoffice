import { z } from 'zod'
import type { World } from './model.ts'
import type { ScenePlugin } from './plugins.ts'
import type { LegacyWorldMigration } from './SceneRuntime.ts'
import type { PoseSupport } from './actionContract.ts'

export const scenePackManifestSchema = z.strictObject({
  id: z.string().min(1), version: z.string().min(1), apiVersion: z.literal(1),
})

/** Trusted, headless definitions. Rendering and animation are assembled separately. */
export interface ScenePack {
  readonly manifest: z.infer<typeof scenePackManifestSchema>
  readonly plugins: readonly ScenePlugin[]
  createWorld(sceneId?: string): World
  supportsPose?: PoseSupport
  migrateLegacyWorld?: LegacyWorldMigration
}
