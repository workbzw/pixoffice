import { createSceneRuntime } from '@pixoffice/runtime/createSceneRuntime'
import type { CreateSceneRuntimeOptions } from '@pixoffice/runtime/createSceneRuntime'
import { officeScenePack } from '@pixoffice/scene-office/core'

export function createOfficeRuntime(options: CreateSceneRuntimeOptions = {}) {
  return createSceneRuntime(officeScenePack, options)
}
