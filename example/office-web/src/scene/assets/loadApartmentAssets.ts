// Office defaults are retained only for legacy preview and integration callers.
import { AGENT_ROSTER } from '../layout/officeLayout.ts'
import { acquireCharacterPacks, getCharacterPack } from '@pixoffice/assets-office/frame/resources'
import { resolveCharacterClip } from '@pixoffice/assets-office/frame/packSchema'
import { characterPoseClip, supportsOfficePose } from '../../contracts/characterPose.ts'
import type { PoseSupport } from '@pixoffice/runtime/actionContract'
export * from '@pixoffice/assets-office/frame/resources'

export const supportsCharacterPose: PoseSupport = (id, posture, facing) => {
  const pack = getCharacterPack(id)
  return pack ? Boolean(resolveCharacterClip(pack.manifest, characterPoseClip(posture, facing))) : supportsOfficePose(id, posture, facing)
}
export function isApartmentReady(id?: string): boolean {
  return id ? Boolean(getCharacterPack(id)) : AGENT_ROSTER.every(agent => getCharacterPack(agent.id))
}
export async function loadApartmentAssets(ids = AGENT_ROSTER.map(agent => agent.id), onLoaded?: (id: string) => void, options?: Parameters<typeof acquireCharacterPacks>[2]) {
  try { return await acquireCharacterPacks(ids, onLoaded, options) }
  catch (error) { console.error('[Characters] 人物资源包加载失败，使用占位人物', error); return undefined }
}
