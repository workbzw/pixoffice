import type { AnimationAdapter, VisualAssetManifest } from '@pixoffice/contracts/animation'
import { visualAssetManifestSchema } from '@pixoffice/contracts/animation'

/** Only the application registers executable adapters, never external scene commands. */
export class AnimationRegistry<TNode> {
  private adapters = new Map<string, AnimationAdapter<TNode>>()
  register(adapter: AnimationAdapter<TNode>) {
    if (this.adapters.has(adapter.id)) throw new Error(`Duplicate animation adapter: ${adapter.id}`)
    if (adapter.apiVersion !== 1 || adapter.rendererApiVersion !== 'pixi-1') throw new Error('Incompatible animation adapter')
    this.adapters.set(adapter.id, adapter)
    return this
  }
  acquire(manifest: VisualAssetManifest, signal: AbortSignal) {
    signal.throwIfAborted()
    visualAssetManifestSchema.parse(manifest)
    const adapter = this.adapters.get(manifest.adapterId)
    if (!adapter || manifest.schemaVersion !== 1 || adapter.apiVersion !== manifest.adapterApiVersion || adapter.rendererApiVersion !== manifest.rendererApiVersion) {
      throw new Error(`Incompatible animation asset: ${manifest.asset.id}`)
    }
    return adapter.acquire(manifest, signal)
  }
}
