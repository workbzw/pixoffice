import { createSceneRuntime } from '@pixoffice/runtime/createSceneRuntime'
import { browserPersistence } from '@pixoffice/runtime/adapters/storage'
import { referenceOfficeScenePack } from '@pixoffice/scene-office/core'
import { seatStepDurationMs } from '@pixoffice/scene-office/pixi/projection'
import type { ScenePack } from '@pixoffice/runtime/scenePack'
import type { OfficeEnvironment } from '../application/officeEnvironment.ts'
import { supportsCharacterPose } from '../application/poseSupport.ts'

export const civicScenePack: ScenePack = {
  ...referenceOfficeScenePack,
  manifest: { id: 'pixoffice.civic', version: '1.0.0', apiVersion: 1 },
}

export function civicEntryUrl(href: string): URL {
  const url = new URL(href)
  if (!['classic', 'members'].includes(url.searchParams.get('shell') ?? '')) url.searchParams.set('shell', 'members')
  return url
}

export function createCivicEnvironment(storage: Storage): OfficeEnvironment {
  return {
    createRuntime: (sceneId, persistent) => createSceneRuntime(civicScenePack, { sceneId,
      ...(persistent ? { persistence: browserPersistence(storage, sceneId, 'civic') } : {}),
      seatStepDuration: seatStepDurationMs, supportsPose: supportsCharacterPose }),
    storage: {
      getItem: key => storage.getItem(`pixoffice:civic:${key}`),
      setItem: (key, value) => storage.setItem(`pixoffice:civic:${key}`, value),
    },
    chatKey: key => `civic:${key}`,
  }
}
