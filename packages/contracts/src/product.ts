import { z } from 'zod'
import type { VisualAssetManifest } from './animation.ts'

/** A host-level boundary, not a runtime switch or an asset URL convention. */
export const sceneProductSchema = z.strictObject({
  id: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_.-]+$/),
  storageNamespace: z.string().min(1).max(100),
  presentationProfileId: z.string().min(1).max(200),
})
export type SceneProduct = z.infer<typeof sceneProductSchema>

export function assertProductAppearance(product: SceneProduct, manifest: VisualAssetManifest): void {
  if (manifest.presentationProfileId !== product.presentationProfileId) throw new Error(`Appearance ${manifest.asset.id} is incompatible with product ${product.id}`)
}
