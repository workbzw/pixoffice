import type { ActionVariant } from '@pixoffice/contracts'
import type { FrameAssetManifest } from '@pixoffice/animation-frame/FrameAdapter'
import type { CharacterManifest } from '@pixoffice/animation-frame/packSchema'

export const farmAppearanceIds = ['farm-gardener'] as const
export function bindFarmFrames(source: CharacterManifest, uri: string): FrameAssetManifest {
  const variants: ActionVariant[] = [], bindings: FrameAssetManifest['source']['bindings'] = {}
  function add(actionId: string, view: ActionVariant['view'], clip: string) {
    if (!source.clips[clip]) throw new Error(`Farm asset is missing ${clip}`)
    const variantId = `${actionId}.standing.${view}`
    variants.push({ variantId, actionId, poseId: 'standing', view, channel: 'base', clockModes: actionId === 'core.walk' ? ['time', 'distance'] : ['time', 'progress'] })
    bindings[variantId] = { clip }
  }
  for (const view of ['front', 'back', 'left', 'right'] as const) {
    add('core.idle', view, `idle.${view}`); add('core.walk', view, `walk.${view}`)
  }
  for (const action of ['plant', 'water', 'harvest']) add(`farm.${action}`, 'back', `farm.${action}`)
  return { schemaVersion: 1, asset: { id: source.id, revision: source.revision }, adapterId: 'pixoffice.frame', adapterApiVersion: 1,
    rendererApiVersion: 'pixi-1', presentationProfileId: 'farm-character-v1',
    capabilities: { variants, combinations: variants.map(v => [v.variantId]), contactProfiles: [], sockets: [{ id: 'root.ground', policy: 'stable' }, { id: 'ui.label', policy: 'stable' }] },
    source: { format: 'pixoffice-frame-v1', uri, bindings } }
}
