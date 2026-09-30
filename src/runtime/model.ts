import type { CommandRecord } from './protocol'
import type { MapDraftSnapshot } from './map/MapDraft'

export type Point = { x: number; y: number }
export type Facing = 'front' | 'back' | 'left' | 'right'
export type Box = { left: number; top: number; right: number; bottom: number }
export type CellStep = { from: Point; to: Point; elapsedMs: number; durationMs: number }
export type FurnitureInteraction = {
  name: string; anchor: string; approaches: string[]; cells: Point[]
  facing: Facing; posture: 'standing' | 'seated'; requiresHome?: boolean; resource?: string
}
export type SeatTransition = {
  propId: string; approach: Point; seat: Point; passage: Point[]; target?: Point
  stage: 'rising' | 'exiting' | 'aligning' | 'entering' | 'sitting'
  interactionId?: string
  progress: number; seatedAmount: number; waiting?: boolean; reserved?: boolean
}
export type Actor = {
  id: string; name: string; templateId: string; color: number; position: Point; homeId?: string
  facing: Facing; posture: 'standing' | 'seated'; motion?: { path: Point[]; index: number; waiting?: boolean }
  presentation: { status: 'idle' | 'working' | 'thinking'; title: string; sourceRevision: number }
  speech?: { text: string; remainingMs: number }
  expression?: string
  step?: CellStep
  using?: { propId: string; interactionId: string }
  seatTransition?: SeatTransition
}
export type Prop = { id: string; name: string; templateId: string; position: Point; anchors?: Record<string, Point>; state: Record<string, unknown>; stateRevision: number }
export type Template = {
  id: string; name: string; view: string
  footprint: Box
  /** Explicit permissions for entering occupied cells while using furniture. */
  interactions?: Record<string, FurnitureInteraction>
  anchors: Record<string, Point>; resources: Record<string, number>
  optionalAnchors?: string[]
}
export type World = {
  sceneId: string; unit: 'cell'; width: number; height: number; gridSize: 1; layoutRevision: number
  bounds: { left: number; top: number; right: number; bottom: number }
  /** Optional convex ground-plane boundary; bounds still describe the layout canvas. */
  walkableArea?: Point[]
  blockedAreas?: { id: string; name: string; bounds: Box }[]
  actors: Actor[]; props: Prop[]
}
export type Claim = { resource: string; units: number }
export type Move = {
  actorId: string; targetId: string; anchor: string; alternatives?: string[]
  interactionId?: string
}
export type Pose = { actorId: string; posture?: Actor['posture']; facing?: Facing; lookAt?: string; expression?: string }
export type Phase = {
  title: string; moves?: Move[]; durationMs?: number
  speech?: { actorId: string; text: string }[]
  /** Required arrival poses also constrain candidate destinations in this phase. */
  poses?: Pose[]
}
export type ActivityPlan = { title: string; claims: Claim[]; phases: Phase[]; continuous?: boolean; maxDurationMs?: number }
export type Activity = {
  id: string; commandId: string; pluginId: string; capability: string; participants: string[]
  plan: ActivityPlan; phaseIndex: number; phaseStarted: boolean; elapsedMs: number; phaseElapsedMs: number
  status: 'active' | 'completed' | 'cancelled' | 'failed'; error?: { code: string; message: string }
}
export type SceneEvent = { eventId: string; sequence: number; sceneId: string; runtimeId: string; type: string; timestamp: number; data: Record<string, unknown> }
export type InterruptedActivity = { id: string; commandId: string; capability: string; title: string }
export type Checkpoint = { version: 2; world: World; records: CommandRecord[]; pluginVersions: Record<string, string>; activeActivities: InterruptedActivity[] }
export type Snapshot = {
  world: World; activities: Activity[]; records: CommandRecord[]; events: SceneEvent[]
  resources: { resource: string; holders: string[]; capacity: number }[]
  plugins: { id: string; name: string; version: string; enabled: boolean; capabilities: string[] }[]
  editing: boolean; editor?: MapDraftSnapshot; persistenceError?: string; canRecoverLayout: boolean
}
export interface Persistence {
  load(): unknown
  save(checkpoint: Checkpoint): void
  replaceWithBackup?(expected: unknown, checkpoint: Checkpoint): void
}

export function facingToward(from: Point, to: Point): Facing {
  const dx = to.x - from.x, dy = to.y - from.y
  return Math.abs(dx) >= Math.abs(dy) ? dx < 0 ? 'left' : 'right' : dy < 0 ? 'back' : 'front'
}
