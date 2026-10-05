export type CharacterPosture = 'standing' | 'seated'
export type CharacterFacing = 'front' | 'back' | 'left' | 'right'

export function characterPoseClip(posture: CharacterPosture, facing: CharacterFacing) {
  return posture === 'standing' ? `idle.${facing}` : facing === 'back' ? 'sit.back' : `talk.seated-${facing}`
}

export const OFFICE_SEATED_CLIPS = ['sit.back', 'talk.seated-left', 'talk.seated-right'] as const

/** The standard office pack guarantees these poses before textures are loaded. */
export function supportsOfficePose(_templateId: string, posture: CharacterPosture, facing: CharacterFacing) {
  return posture === 'standing' || OFFICE_SEATED_CLIPS.some(clip => clip === characterPoseClip(posture, facing))
}
