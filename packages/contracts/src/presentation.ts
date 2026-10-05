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

export interface PresentedActor {
  id: string
  appearanceId: string
  name: string
  position: { x: number; y: number }
  depth: number
  displayHeight: number
  intent: ActorIntent
  status: string
  title?: string
  bubble?: string
  furniture?: { propId: string; seated: boolean; transitioning: boolean }
}
