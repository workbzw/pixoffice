import { createSceneRuntime } from '@pixoffice/runtime/createSceneRuntime'
import type { CreateSceneRuntimeOptions } from '@pixoffice/runtime/createSceneRuntime'
import { officeScenePack, referenceOfficeScenePack } from '@pixoffice/scene-office/core'

export function createOfficeRuntime({ referenceLayout = false, ...options }: CreateSceneRuntimeOptions & { referenceLayout?: boolean } = {}) {
  return createSceneRuntime(referenceLayout ? referenceOfficeScenePack : officeScenePack, options)
}
