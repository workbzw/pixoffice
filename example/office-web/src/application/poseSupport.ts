import { getCharacterPack } from '@pixoffice/assets-office/frame/resources'
import { resolveCharacterClip } from '@pixoffice/assets-office/frame/packSchema'
import { characterPoseClip, supportsOfficePose } from '@pixoffice/scene-office/core/poseSupport'
import type { PoseSupport } from '@pixoffice/runtime/actionContract'

export const supportsCharacterPose: PoseSupport = (id, posture, facing) => {
  const pack = getCharacterPack(id)
  return pack ? Boolean(resolveCharacterClip(pack.manifest, characterPoseClip(posture, facing))) : supportsOfficePose(id, posture, facing)
}
