import { browserPersistence } from '@pixoffice/runtime/adapters/storage'
import type { SceneRuntime } from '@pixoffice/runtime/SceneRuntime'
import { seatStepDurationMs } from '@pixoffice/scene-office/pixi/projection'
import { createOfficeRuntime } from './createOfficeRuntime.ts'
import { supportsCharacterPose } from './poseSupport.ts'

export interface OfficeEnvironment {
  createRuntime(sceneId: string, persistent: boolean): SceneRuntime
  readonly storage: Pick<Storage, 'getItem' | 'setItem'>
  chatKey(sourceKey: string): string
}

export const officeEnvironment: OfficeEnvironment = {
  createRuntime: (sceneId, persistent) => createOfficeRuntime({ sceneId, referenceLayout: true,
    ...(persistent ? { persistence: browserPersistence(localStorage, sceneId) } : {}),
    seatStepDuration: seatStepDurationMs, supportsPose: supportsCharacterPose }),
  get storage() { return localStorage },
  chatKey: key => key,
}
