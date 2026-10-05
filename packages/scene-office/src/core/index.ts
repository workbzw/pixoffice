import type { ScenePack } from '@pixoffice/runtime/scenePack'
import { supportsOfficePose } from './poseSupport.ts'
import { builtinPlugins, createOfficeWorld } from './pack.ts'
import { migrateLegacyWorld } from './migrateLegacy.ts'

export const officeScenePack: ScenePack = {
  manifest: { id: 'pixoffice.office', version: '1.0.0', apiVersion: 1 },
  plugins: builtinPlugins, createWorld: createOfficeWorld,
  supportsPose: supportsOfficePose, migrateLegacyWorld,
}
export * from './pack.ts'
