import { browserPersistence } from '@pixoffice/runtime/adapters/storage'
import { seatStepDurationMs } from '@pixoffice/scene-office/pixi/projection'
import { officeLayoutIdSchema } from '@pixoffice/protocol/office-integration'
import type { OfficeEnvironment } from '../application/officeEnvironment.ts'
import { createOfficeRuntime } from '../application/createOfficeRuntime.ts'
import { supportsCharacterPose } from '../application/poseSupport.ts'

export function collaborationEntryUrl(href: string): URL {
  const url = new URL(href)
  if (!officeLayoutIdSchema.safeParse(url.searchParams.get('shell')).success) url.searchParams.set('shell', 'rounded')
  return url
}

export function createCollaborationEnvironment(storage: Storage): OfficeEnvironment {
  return {
    presentation: 'panorama',
    createRuntime: (sceneId, persistent) => createOfficeRuntime({ sceneId, referenceLayout: true,
      ...(persistent ? { persistence: browserPersistence(storage, sceneId, 'collaboration') } : {}),
      seatStepDuration: seatStepDurationMs, supportsPose: supportsCharacterPose }),
    storage: {
      getItem: key => storage.getItem(`pixoffice:collaboration:${key}`),
      setItem: (key, value) => storage.setItem(`pixoffice:collaboration:${key}`, value),
    },
    chatKey: key => `collaboration:${key}`,
  }
}
