import type { AgentState } from '../types.ts'

export type ApartmentPose = 'idle' | 'walking' | 'seated' | 'typing' | 'wave' | 'thinking' | 'surprised'

export function apartmentPoseForState(state: AgentState, animation?: string, atDesk = false): ApartmentPose {
  if (state === 'walking') return 'walking'
  if (animation === 'emotes/wave') return 'wave'
  if (animation === 'emotes/thinking') return 'thinking'
  if (animation === 'emotes/surprised') return 'surprised'
  if (atDesk && state === 'working') return 'typing'
  if (atDesk) return 'seated'
  return 'idle'
}
