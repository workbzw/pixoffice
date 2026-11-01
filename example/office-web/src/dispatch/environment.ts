import { browserPersistence } from '@pixoffice/runtime/adapters/storage'
import { seatStepDurationMs } from '@pixoffice/scene-office/pixi/projection'
import { officeLayoutIdSchema } from '@pixoffice/protocol/office-integration'
import type { OfficeEnvironment } from '../application/officeEnvironment.ts'
import { createOfficeRuntime } from '../application/createOfficeRuntime.ts'
import { supportsCharacterPose } from '../application/poseSupport.ts'

export function dispatchEntryUrl(href: string): URL {
  const url = new URL(href)
  if (!officeLayoutIdSchema.safeParse(url.searchParams.get('shell')).success) url.searchParams.set('shell', 'members')
  return url
}

export function createDispatchEnvironment(storage: Storage): OfficeEnvironment {
  return {
    presentation: 'reference',
    layoutStorageKey: 'pixoffice:dispatch:page-shell:v1',
    createRuntime: (sceneId, persistent) => createOfficeRuntime({ sceneId, referenceLayout: true,
      ...(persistent ? { persistence: browserPersistence(storage, sceneId, 'dispatch') } : {}),
      seatStepDuration: seatStepDurationMs, supportsPose: supportsCharacterPose }),
    storage: {
      getItem: key => storage.getItem(`pixoffice:dispatch:${key}`),
      setItem: (key, value) => storage.setItem(`pixoffice:dispatch:${key}`, value),
    },
    chatKey: key => `dispatch:${key}`,
  }
}
