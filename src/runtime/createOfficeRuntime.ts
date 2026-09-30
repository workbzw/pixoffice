import { OfficeRuntime } from './OfficeRuntime'
import { builtinPlugins, createOfficeWorld } from './builtin/officePack'
import type { Persistence } from './model'
import { GridNavigation } from './navigation'
import type { NavigationFactory } from './navigationAdapter'
import type { SeatStepDuration } from './seatInteraction'
import type { PoseSupport } from './actionContract'
import { supportsOfficePose } from '../contracts/characterPose'

export function createOfficeRuntime(options: { sceneId?: string; persistence?: Persistence; now?: () => number; runtimeId?: string; createNavigation?: NavigationFactory; seatStepDuration?: SeatStepDuration; supportsPose?: PoseSupport } = {}) {
  return new OfficeRuntime({ ...options, world: createOfficeWorld(options.sceneId), plugins: builtinPlugins,
    supportsPose: options.supportsPose ?? supportsOfficePose,
    createNavigation: options.createNavigation ?? (templates => new GridNavigation(templates)) })
}
