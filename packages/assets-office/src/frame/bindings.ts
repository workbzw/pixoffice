import type { ActionVariant, ViewDirection } from '@pixoffice/contracts/animation'
import type { FrameAssetManifest } from '@pixoffice/animation-frame/FrameAdapter'
import { resolveCharacterClip, type CharacterManifest } from './packSchema.ts'

/** Compatibility metadata for the existing artwork; image content and URLs stay unchanged. */
export function bindOfficeFrames(source: CharacterManifest, uri: string): FrameAssetManifest {
  const variants: ActionVariant[] = [], combinations: string[][] = []
  const bindings: FrameAssetManifest['source']['bindings'] = {}
  const add = (actionId: string, poseId: string, view: ViewDirection, clip: string, channel: ActionVariant['channel'] = 'base', mouthLayer = false) => {
    if (!source.clips[clip]) return undefined
    const variantId = `${actionId}.${poseId}.${view}`
    if (bindings[variantId]) return variantId
    variants.push({ variantId, actionId, poseId, view, channel,
      clockModes: channel === 'speech' ? ['time'] : actionId === 'core.walk' ? ['time', 'distance'] : ['time', 'progress'] })
    bindings[variantId] = { clip, mouthLayer }
    if (channel === 'base') combinations.push([variantId])
    return variantId
  }
  for (const view of ['front', 'back', 'left', 'right'] as const) {
    add('core.idle', 'standing', view, `idle.${view}`)
    add('core.walk', 'standing', view, `walk.${view}`)
    add('core.idle', 'seated', view, view === 'back' ? 'sit.back' : `talk.seated-${view}`)
  }
  add('core.sit-down', 'transition', 'back', 'sit-down.back')
  add('core.stand-up', 'transition', 'back', 'stand-up.back')
  const workClip = source.clips['work.quiet-back'] ? 'work.quiet-back' : source.clips['work.typing-back'] ? 'work.typing-back' : undefined
  if (workClip) add('office.type', 'seated', 'back', workClip)
  for (const emote of ['wave', 'thinking', 'surprised']) add(`core.emote.${emote}`, 'standing', 'front', `emote.${emote}`)
  for (const base of [...variants].filter(variant => ['core.idle', 'office.type'].includes(variant.actionId))) {
    const clipName = bindings[base.variantId].clip
    // Existing back views have no visible mouth. Do not invent an unsupported speech pose.
    const view = base.poseId === 'seated' ? `seated-${base.view}` : base.view
    const attachment = resolveCharacterClip(source, clipName)?.frames.find(frame => frame.mouth)?.mouth
    const mouth = attachment && source.mouth?.views[attachment.view]
    const speechClip = mouth ? mouth.speaking : `speak.${view}`
    const speech = add('core.speak', base.poseId, base.view, speechClip, 'speech', Boolean(mouth))
    if (speech) combinations.push([base.variantId, speech])
  }
  return {
    schemaVersion: 1, asset: { id: source.id, revision: source.revision }, adapterId: 'pixoffice.frame', adapterApiVersion: 1,
    rendererApiVersion: 'pixi-1', presentationProfileId: 'office-character-v1',
    capabilities: { variants, combinations, contactProfiles: ['office-desk-v1'], sockets: [{ id: 'root.ground', policy: 'stable' }, { id: 'ui.label', policy: 'stable' }] },
    source: { format: 'pixoffice-frame-v1', uri, bindings },
  }
}
