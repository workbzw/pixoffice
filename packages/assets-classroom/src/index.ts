import type { ActionVariant, ViewDirection } from '@pixoffice/contracts'
import type { FrameAssetManifest } from '@pixoffice/animation-frame/FrameAdapter'
import { resolveCharacterClip } from '@pixoffice/animation-frame/packSchema'
import type { CharacterManifest } from '@pixoffice/animation-frame/packSchema'

export const classroomAppearanceIds = ['classroom-teacher', 'classroom-student-1', 'classroom-student-2', 'classroom-student-3', 'classroom-student-4', 'classroom-student-5'] as const

/** Classroom semantics remain independent of the animation player's implementation. */
export function bindClassroomFrames(source: CharacterManifest, uri: string): FrameAssetManifest {
  const variants: ActionVariant[] = [], combinations: string[][] = []
  const bindings: FrameAssetManifest['source']['bindings'] = {}
  const add = (actionId: string, poseId: string, view: ViewDirection, clip: string, speech = false) => {
    if (!source.clips[clip]) throw new Error(`Classroom asset ${source.id} is missing ${clip}`)
    const variantId = `${actionId}.${poseId}.${view}`
    variants.push({ variantId, actionId, poseId, view, channel: speech ? 'speech' : 'base',
      clockModes: speech ? ['time'] : actionId === 'core.walk' ? ['time', 'distance'] : ['time', 'progress'] })
    bindings[variantId] = { clip, mouthLayer: speech }
    if (!speech) combinations.push([variantId])
    return variantId
  }
  for (const view of ['front', 'back', 'left', 'right'] as const) {
    add('core.idle', 'standing', view, `idle.${view}`)
    add('core.walk', 'standing', view, `walk.${view}`)
  }
  for (const view of ['back', 'left', 'right'] as const) add('core.idle', 'seated', view, view === 'back' ? 'sit.back' : `talk.seated-${view}`)
  add('core.sit-down', 'transition', 'back', 'sit-down.back')
  add('core.stand-up', 'transition', 'back', 'stand-up.back')
  for (const base of variants.filter(v => v.actionId === 'core.idle')) {
    const attachment = resolveCharacterClip(source, bindings[base.variantId].clip)?.frames.find(f => f.mouth)?.mouth
    const mouth = attachment && source.mouth?.views[attachment.view]
    if (mouth) combinations.push([base.variantId, add('core.speak', base.poseId, base.view, mouth.speaking, true)])
  }
  return {
    schemaVersion: 1, asset: { id: source.id, revision: source.revision }, adapterId: 'pixoffice.frame', adapterApiVersion: 1,
    rendererApiVersion: 'pixi-1', presentationProfileId: 'classroom-character-v1',
    capabilities: { variants, combinations, contactProfiles: [], sockets: [{ id: 'root.ground', policy: 'stable' }, { id: 'ui.label', policy: 'stable' }] },
    source: { format: 'pixoffice-frame-v1', uri, bindings },
  }
}
