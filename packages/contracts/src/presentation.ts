import type { ContactTarget, ViewDirection } from './animation.ts'

export interface ActorIntent {
  actionId: string
  poseId: string
  view: ViewDirection
  progress?: number
  speech?: string
  contactProfileId?: string
  contacts?: ContactTarget[]
}

/** View data only; task ownership and progress remain in the business system. */
export interface ActorTaskPresentation {
  id?: string
  title: string
  detail?: string
  status: 'idle' | 'queued' | 'running' | 'blocked' | 'completed' | 'failed'
  progress?: number
  /** Activity progress is visual only; only a completed status may fill it to 100%. */
  progressMode?: 'reported' | 'activity'
}

export interface PresentedActor {
  id: string
  appearanceId: string
  name: string
  position: { x: number; y: number }
  depth: number
  displayHeight: number
  /** Scene-owned label placement, independent of the animation implementation. */
  label?: { placement: 'beside'; x: number; y: number; scale?: number }
    | { placement: 'above'; scale?: number }
  /** Optional ground-space gait input. Existing packs retain their calibrated screen-space gait. */
  locomotion?: { position: { x: number; y: number }; strideCells: number }
  intent: ActorIntent
  status: string
  title?: string
  task?: ActorTaskPresentation
  /** Optional scene-space attachment, independent of the character's position. */
  taskAnchor?: { x: number; y: number; placement?: 'above' | 'right' }
  bubble?: string
  furniture?: { propId: string; seated: boolean; transitioning: boolean }
}
