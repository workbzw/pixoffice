import type { Container } from 'pixi.js'
import { z } from 'zod'
import { entityPresentationSchema, visualAssetManifestSchema } from '@pixoffice/contracts/animation'
import type { AnimatedVisual, AnimationAdapter, VisualAssetLease, VisualAssetManifest, VisualRequest } from '@pixoffice/contracts/animation'
import { assessVisualRequest } from '@pixoffice/contracts/animationSupport'
import { characterAssets } from './resources.ts'
import { FrameSprite } from './FrameSprite.ts'
import { characterFrameDependencies, resolveCharacterClip } from './packSchema.ts'
import type { CharacterPackResources } from './CharacterPackResources.ts'

export interface FrameAssetManifest extends VisualAssetManifest {
  source: { format: 'pixoffice-frame-v1'; uri: string; bindings: Record<string, { clip: string; mouthLayer?: boolean }> }
}

type ResourceLease = { value: CharacterPackResources; release(): void }
type AcquireResources = (manifest: FrameAssetManifest) => Promise<ResourceLease>
const sourceSchema = z.strictObject({
  format: z.literal('pixoffice-frame-v1'), uri: z.string().min(1),
  bindings: z.record(z.string(), z.strictObject({ clip: z.string().min(1), mouthLayer: z.boolean().optional() })),
})

export class FrameAdapter implements AnimationAdapter<Container> {
  readonly id = 'pixoffice.frame'
  readonly apiVersion = 1 as const
  readonly rendererApiVersion = 'pixi-1' as const
  private acquireResources: AcquireResources

  constructor(acquireResources: AcquireResources = manifest => characterAssets.acquire(manifest.asset.id, manifest.source.uri)) {
    this.acquireResources = acquireResources
  }

  async acquire(input: VisualAssetManifest, signal: AbortSignal): Promise<VisualAssetLease<Container>> {
    signal.throwIfAborted()
    visualAssetManifestSchema.parse(input)
    if (input.adapterId !== this.id || input.adapterApiVersion !== 1 || input.rendererApiVersion !== this.rendererApiVersion || input.source.format !== 'pixoffice-frame-v1' || !('bindings' in input.source)) throw new Error('Invalid frame asset manifest')
    const manifest = structuredClone(input) as FrameAssetManifest
    sourceSchema.parse(manifest.source)
    for (const ids of manifest.capabilities.combinations) {
      const variants = ids.map(id => manifest.capabilities.variants.find(v => v.variantId === id)!)
      if (variants.filter(v => v.channel === 'base').length !== 1 || variants.filter(v => v.channel === 'speech').length > 1 || variants.some(v => v.channel === 'gesture')) {
        throw new Error('Frame combinations require one base and at most one speech action')
      }
    }
    if (manifest.capabilities.variants.some(v => v.channel === 'speech' && v.clockModes.some(mode => mode !== 'time'))) throw new Error('Frame speech requires a time clock')
    if (manifest.capabilities.sockets.some(socket => !['root.ground', 'ui.label'].includes(socket.id))) throw new Error('Unknown frame socket')
    const resource = await this.acquireResources(manifest)
    const pack = resource.value
    try {
      signal.throwIfAborted()
      if (pack.manifest.id !== manifest.asset.id || pack.manifest.revision !== manifest.asset.revision) throw new Error('Frame resource revision mismatch')
      for (const variant of manifest.capabilities.variants) {
        const binding = manifest.source.bindings[variant.variantId]
        if (!binding || !pack.manifest.clips[binding.clip]) throw new Error(`Missing frame binding: ${variant.variantId}`)
      }
    } catch (error) { resource.release(); throw error }
    let released = false, references = 0, pending = 0, resourceReleased = false
    const retire = () => {
      if (released && !references && !pending && !resourceReleased) { resourceReleased = true; resource.release() }
    }
    const assertLive = () => { if (released) throw new Error('Animation lease released') }
    const assess = (request: VisualRequest) => { assertLive(); return assessVisualRequest(manifest, request) }
    const names = (request: VisualRequest) => {
      const support = assess(request)
      if (!support.supported) throw new Error(`Unsupported animation: ${support.missing.join(', ')}`)
      return request.variantIds.map(id => manifest.source.bindings[id].clip)
    }
    const lease: VisualAssetLease<Container> = {
      manifest,
      assess,
      async prepare(requests, signal) {
        assertLive(); signal.throwIfAborted()
        const clips = [...new Set(requests.flatMap(names))]
        pending++
        try {
          await pack.ensureClips(clips)
          signal.throwIfAborted(); assertLive()
        } finally { pending--; retire() }
      },
      create(initial) {
        assertLive()
        const visual = new FrameSprite(pack)
        visual.scale.set(1 / pack.manifest.displayHeight)
        let disposed = false
        const instance: AnimatedVisual<Container> = {
          root: visual,
          sample(state) {
            if (disposed) throw new Error('Animation instance disposed')
            entityPresentationSchema.parse(state)
            const clips = namesForInstance(state.request)
            if (characterFrameDependencies(pack.manifest, clips).some(key => !pack.textures.has(key))) throw new Error('Animation resources not prepared')
            const variants = state.actions.map(action => {
              const variant = manifest.capabilities.variants.find(v => v.variantId === action.variantId)!
              if (!variant.clockModes.includes(action.clock.mode)) throw new Error(`Unsupported animation clock: ${action.variantId}`)
              return { action, variant, binding: manifest.source.bindings[action.variantId] }
            })
            const base = variants.find(item => item.variant.channel === 'base')
            const speech = variants.find(item => item.variant.channel === 'speech')
            if (!base) throw new Error('Frame animation requires a base action')
            if (state.contacts.length) throw new Error('Frame contact retargeting is not supported; use a compatible authored contact profile')
            const sample = speech && !speech.binding.mouthLayer ? speech : base
            const clip = resolveCharacterClip(pack.manifest, sample.binding.clip)!
            const clock = sample.action.clock, duration = clip.frames.reduce((sum, frame) => sum + frame.durationMs, 0)
            const elapsed = clock.mode === 'time' ? clock.loop ? clock.elapsedMs : Math.min(clock.elapsedMs, Math.max(0, duration - 0.001))
              : clock.mode === 'distance' ? clock.travelledDu / clock.strideDu * duration : 0
            const speechTime = speech?.action.clock.mode === 'time' ? speech.action.clock.elapsedMs : undefined
            visual.renderClip(sample.binding.clip, elapsed, clock.mode === 'progress' ? clock.progress : undefined, speechTime)
            return []
          },
          getSocket(id) {
            if (id === 'root.ground') return { x: 0, y: 0 }
            if (id === 'ui.label') return { x: 0, y: visual.getHeadOffsetY() / pack.manifest.displayHeight }
            return undefined
          },
          getHitBounds() { return { left: -34 / 84, top: -92 / 84, right: 34 / 84, bottom: 32 / 84 } },
          dispose() {
            if (disposed) return
            disposed = true; visual.destroy({ children: true }); references--; retire()
          },
        }
        // Existing instances remain valid until disposed even after their owner releases its lease.
        function namesForInstance(request: VisualRequest) {
          const support = assessVisualRequest(manifest, request)
          if (!support.supported) throw new Error(`Unsupported animation: ${support.missing.join(', ')}`)
          return request.variantIds.map(id => manifest.source.bindings[id].clip)
        }
        references++
        try { instance.sample(initial); return instance }
        catch (error) { instance.dispose(); throw error }
      },
      release() { if (released) return; released = true; retire() },
    }
    return lease
  }
}
