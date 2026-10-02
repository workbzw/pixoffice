import type { Agent, AgentState } from '@/types/agent'
import type { CharacterFacing } from './characterFacing'
import { isHomeDeskSeat } from '@/scene/systems/MovementSystem'
import type { SeatTransition } from '@/runtime/model'

export type SpriteFrame = { x: number; y: number; width: number; height: number }
export type ApartmentPose = 'idle' | 'walking' | 'seated' | 'typing' | 'wave' | 'thinking' | 'surprised'

// Preserve the former high-lift gait as running, separate from indoor walking.
export const BACK_WALK_FRAMES: Readonly<Record<string, readonly number[]>> = {
  marvis: [0, 2, 4, 6],
  'code-agent': [0, 2, 4, 6],
  'file-agent': [0, 2, 4, 6],
  'app-agent': [3, 2, 7, 6],
  'review-agent': [1, 2, 5, 6],
  'data-agent': [0, 2, 4, 6],
}
export const BACK_WALK_CYCLE_DURATION = 0.8

export const INDOOR_BACK_WALK_ROWS: Readonly<Record<string, number>> = {
  marvis: 0,
  'code-agent': 1,
  'file-agent': 2,
  'app-agent': 3,
  'review-agent': 4,
  'data-agent': 5,
}
export const INDOOR_WALK_CYCLE_DURATION = 1

export const APARTMENT_EMOTES = [
  { label: '挥手', animation: 'emotes/wave' },
  { label: '思考表情', animation: 'emotes/thinking' },
  { label: '惊讶', animation: 'emotes/surprised' },
] as const

export function resolveApartmentFrame(
  facing: CharacterFacing,
  pose: Exclude<ApartmentPose, 'seated' | 'typing'>,
  elapsed = 0,
): { index: number; mirrored: boolean } {
  if (pose === 'wave') return { index: 9, mirrored: false }
  if (pose === 'thinking') return { index: 10, mirrored: false }
  if (pose === 'surprised') return { index: 11, mirrored: false }
  const row = facing === 'back' ? 2 : facing === 'front' ? 0 : 1
  const step = pose === 'walking' ? [1, 0, 2, 0][Math.floor(elapsed * 8) % 4] : 0
  return { index: row * 3 + step, mirrored: facing === 'left' }
}

export function apartmentPoseForState(state: AgentState, animation?: string, atDesk = false): ApartmentPose {
  if (state === 'walking') return 'walking'
  if (animation === 'emotes/wave') return 'wave'
  if (animation === 'emotes/thinking') return 'thinking'
  if (animation === 'emotes/surprised') return 'surprised'
  if (atDesk && state === 'working') return 'typing'
  if (atDesk) return 'seated'
  return 'idle'
}

export function shouldSitAtDesk(agent: Agent): boolean {
  if (agent.seated != null) return agent.seated && !agent.customAnimation && agent.state !== 'walking'
  return (agent.state === 'working' || agent.state === 'thinking' || agent.state === 'idle') &&
    agent.targetX == null && agent.targetY == null && !agent.customAnimation &&
    isHomeDeskSeat(agent.assignedDeskId, agent.x, agent.y)
}

export function resolveSeatTransitionFrame(transition: SeatTransition, facing: CharacterFacing) {
  if (transition.stage === 'rising' || transition.stage === 'sitting') {
    const amount = Math.max(0, Math.min(1, transition.seatedAmount))
    // Authored whole-body keyframes, played in reverse when sitting down.
    if (amount >= .9) return { pose: 'seated' as const, index: 6, height: 72, footY: 10, mirrored: false }
    if (amount >= .55) return { pose: 'lean' as const, index: 6, height: 74, footY: 8, mirrored: false }
    if (amount >= .12) return { pose: 'rise' as const, index: 6, height: 80, footY: 3, mirrored: false }
    return { pose: 'base' as const, index: 6, height: 84, footY: 0, mirrored: false }
  }
  const stepping = transition.stage === 'entering' || transition.stage === 'exiting'
  const frame = resolveApartmentFrame(facing, stepping ? 'walking' : 'idle', transition.progress * .8)
  return { ...frame, pose: 'base' as const, height: 84, footY: 0 }
}

// Generated sheets have slightly uneven spacing. Locate transparent gutters,
// then trim each pose independently so the feet remain anchored during animation.
export function detectApartmentFrames(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  rowCount = 4,
  columnCount = 3,
): SpriteFrame[] {
  if (!Number.isInteger(rowCount) || rowCount < 1 || !Number.isInteger(columnCount) || columnCount < 1 || width < columnCount * 4 || height < rowCount * 4 || rgba.length !== width * height * 4) {
    throw new Error('Invalid character sheet dimensions')
  }
  const opaqueRows = new Uint32Array(height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] >= 64) opaqueRows[y]++
    }
  }
  const rows = [0]
  for (let row = 1; row < rowCount; row++) {
    const center = height * row / rowCount
    const radius = Math.floor(height / (rowCount * 4))
    let nearest = -1
    for (let y = Math.floor(center) - radius; y <= center + radius; y++) {
      if (opaqueRows[y] === 0 && (nearest < 0 || Math.abs(y - center) < Math.abs(nearest - center))) {
        nearest = y
      }
    }
    if (nearest < 0) throw new Error('Character sheet is missing a transparent row gutter')
    rows.push(nearest)
  }
  rows.push(height)

  const frames: SpriteFrame[] = []
  for (let row = 0; row < rowCount; row++) {
    const top = rows[row]
    const bottom = rows[row + 1]
    const opaqueColumns = new Uint32Array(width)
    for (let y = top; y < bottom; y++) {
      for (let x = 0; x < width; x++) {
        if (rgba[(y * width + x) * 4 + 3] >= 64) opaqueColumns[x]++
      }
    }
    const columns = [0]
    for (let col = 1; col < columnCount; col++) {
      const center = width * col / columnCount
      const radius = Math.floor(width / (columnCount * 4))
      let nearest = -1
      for (let x = Math.floor(center) - radius; x <= center + radius; x++) {
        if (opaqueColumns[x] === 0 && (nearest < 0 || Math.abs(x - center) < Math.abs(nearest - center))) nearest = x
      }
      if (nearest < 0) throw new Error('Character sheet is missing a transparent column gutter')
      columns.push(nearest)
    }
    columns.push(width)
    for (let col = 0; col < columnCount; col++) {
      const left = columns[col]
      const right = columns[col + 1]
      let minX = right, minY = bottom, maxX = left - 1, maxY = top - 1
      for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) {
          if (rgba[(y * width + x) * 4 + 3] < 64) continue
          minX = Math.min(minX, x)
          minY = Math.min(minY, y)
          maxX = Math.max(maxX, x)
          maxY = Math.max(maxY, y)
        }
      }
      if (maxX < minX || maxY - minY < height / (rowCount * 2)) {
        throw new Error(`Character pose ${row * columnCount + col} is empty or incomplete`)
      }
      minX = Math.max(left, minX - 2)
      minY = Math.max(top, minY - 2)
      maxX = Math.min(right - 1, maxX + 2)
      maxY = Math.min(bottom - 1, maxY + 2)
      frames.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    }
  }
  return frames
}

export function registerWalkFrames(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  frames = detectApartmentFrames(rgba, width, height, 2, 4),
) {
  // Register to the head center, not the changing silhouette of swinging arms.
  const centers = frames.map(frame => {
    let left = width, right = 0
    for (let y = frame.y; y < frame.y + Math.floor(frame.height * 0.42); y++) {
      for (let x = frame.x; x < frame.x + frame.width; x++) {
        if (rgba[(y * width + x) * 4 + 3] < 64) continue
        left = Math.min(left, x)
        right = Math.max(right, x)
      }
    }
    if (left > right) throw new Error('Walk frame is missing its head')
    return Math.round((left + right) / 2)
  })
  const leftExtent = Math.max(...frames.map((frame, index) => centers[index] - frame.x))
  const rightExtent = Math.max(...frames.map((frame, index) => frame.x + frame.width - centers[index]))
  const frameSize = { width: leftExtent + rightExtent, height: Math.max(...frames.map(frame => frame.height)) }
  return {
    frames,
    frameSize,
    offsets: frames.map((frame, index) => ({
      x: leftExtent - (centers[index] - frame.x),
      y: frameSize.height - frame.height,
    })),
  }
}
