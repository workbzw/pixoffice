import { SceneRuntime } from './SceneRuntime.ts'
import type { SceneRuntimeOptions } from './SceneRuntime.ts'
import { GridNavigation } from './navigation.ts'
import { scenePackManifestSchema } from './scenePack.ts'
import type { ScenePack } from './scenePack.ts'

export type CreateSceneRuntimeOptions = Omit<SceneRuntimeOptions, 'world' | 'plugins' | 'createNavigation'> & {
  sceneId?: string
  createNavigation?: SceneRuntimeOptions['createNavigation']
}

export function createSceneRuntime(pack: ScenePack, options: CreateSceneRuntimeOptions = {}) {
  scenePackManifestSchema.parse(pack.manifest)
  return new SceneRuntime({
    ...options, world: pack.createWorld(options.sceneId), plugins: [...pack.plugins],
    supportsPose: options.supportsPose ?? pack.supportsPose,
    migrateLegacyWorld: options.migrateLegacyWorld ?? pack.migrateLegacyWorld,
    createNavigation: options.createNavigation ?? (templates => new GridNavigation(templates)),
  })
}
