import { scenePrimitives } from '@pixoffice/runtime'
import type { ScenePack } from '@pixoffice/runtime'
import { createFarmActivities } from './activities.ts'
import { createFarmWorld, farmObjects } from './world.ts'
export { createFarmWorld, farmObjects, farmRoster } from './world.ts'
export { crops, cropStatus, createFarmClock, cropIdSchema, plotStateSchema, inventoryStateSchema, emptyPlot } from './crops.ts'
export type { CropId, PlotState, FarmClock } from './crops.ts'
export { tendFarm } from './supervisor.ts'
export { createFarmFlock } from './chickens.ts'
export type { FarmChicken } from './chickens.ts'

export function createFarmScenePack(now: () => number): ScenePack {
  return { manifest: { id: 'pixoffice.farm', version: '1.0.0', apiVersion: 1 },
    plugins: [scenePrimitives, farmObjects, createFarmActivities(now)], createWorld: createFarmWorld,
    supportsPose: (_appearance, posture) => posture === 'standing',
  }
}
