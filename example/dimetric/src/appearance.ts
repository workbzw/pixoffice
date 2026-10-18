import { Container, Graphics } from 'pixi.js'
import { assessVisualRequest } from '@pixoffice/contracts'
import type { AnimationAdapter, VisualAssetManifest } from '@pixoffice/contracts'

/** Diagnostic markers only. Production artwork will be a separate asset pack. */
export const markerManifest: VisualAssetManifest = {
  schemaVersion: 1, asset: { id: 'lab.marker', revision: '1' }, adapterId: 'lab.marker', adapterApiVersion: 1,
  rendererApiVersion: 'pixi-1', presentationProfileId: 'pixoffice.dimetric-lab.v1',
  source: { format: 'procedural-marker', uri: 'local:marker' },
  capabilities: {
    variants: ['standing', 'seated'].flatMap(poseId => ['core.idle', 'core.walk', 'lab.work'].flatMap(actionId =>
      (['front-left', 'front-right', 'back-left', 'back-right'] as const).map(view => ({ variantId: `${poseId}:${actionId}:${view}`, actionId, poseId, view, channel: 'base' as const, clockModes: ['time', 'distance', 'progress'] as const })))).map(v => ({ ...v, clockModes: [...v.clockModes] })),
    combinations: [], contactProfiles: [], sockets: [{ id: 'root.ground', policy: 'stable' }, { id: 'ui.label', policy: 'stable' }],
  },
}
markerManifest.capabilities.combinations = markerManifest.capabilities.variants.map(v => [v.variantId])

export class MarkerAdapter implements AnimationAdapter<Container> {
  readonly id = 'lab.marker'
  readonly apiVersion = 1 as const
  readonly rendererApiVersion = 'pixi-1' as const
  async acquire(manifest: VisualAssetManifest, signal: AbortSignal) {
    signal.throwIfAborted()
    let released = false
    const assess = (request: Parameters<typeof assessVisualRequest>[1]) => assessVisualRequest(manifest, request)
    return {
      manifest, assess,
      async prepare(requests: Parameters<typeof assess>[0][], signal: AbortSignal) {
        signal.throwIfAborted()
        if (released) throw new Error('Marker lease released')
        for (const request of requests) if (!assess(request).supported) throw new Error('Unsupported marker pose')
      },
      create() {
        if (released) throw new Error('Marker lease released')
        const root = new Container(), shape = new Graphics()
        root.addChild(shape)
        return {
          root,
          sample(state: import('@pixoffice/contracts').EntityPresentation) {
            const h = state.request.poseId === 'seated' ? .6 : .9, right = state.request.view.endsWith('right'), back = state.request.view.startsWith('back')
            const working = state.actions[0].variantId.includes('lab.work')
            shape.clear().rect(-.18, -h, .36, h).fill(working ? 0x427e5b : 0x427c91)
              .rect(-.25, -h - .18, .5, .24).fill(0xe8ecef)
              .rect(right ? .12 : -.23, -h - (back ? .16 : .03), .11, .08).fill(0x283b49)
            return []
          },
          getSocket(id: string) { return id === 'ui.label' ? { x: 0, y: -1.15 } : id === 'root.ground' ? { x: 0, y: 0 } : undefined },
          getHitBounds() { return { left: -.3, top: -1.2, right: .3, bottom: .05 } },
          dispose() { root.destroy({ children: true }) },
        }
      },
      release() { released = true },
    }
  }
}
