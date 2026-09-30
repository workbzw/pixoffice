import type { CharacterManifest } from './packSchema.ts'
import { validWorkSurface, type WorkPoint, type WorkSurface } from './workSurface.ts'

export const WORK_CYCLE_MS = 12000
export const QUIET_WORK_CYCLE_MS = 4000
type Rig = NonNullable<CharacterManifest['work']>
export type WorkPartTransform = { clip: string; root: WorkPoint; position: WorkPoint; rotation: number; mirror: 1 | -1 }
const distance = (a: WorkPoint, b: WorkPoint) => Math.hypot(b.x - a.x, b.y - a.y)
const angle = (a: WorkPoint, b: WorkPoint) => Math.atan2(b.y - a.y, b.x - a.x)
const mix = (a: WorkPoint, b: WorkPoint, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
const smooth = (t: number) => t * t * (3 - 2 * t)

/** Fixed-length two-link reach, with elbows bending outwards. No sprite stretching. */
export function solveWorkArm(shoulder: WorkPoint, wrist: WorkPoint, upper: number, lower: number, side: 1 | -1) {
  const d = distance(shoulder, wrist)
  if (d < Math.abs(upper - lower) + .1 || d > upper + lower - .1) return undefined
  const bend = Math.acos(Math.max(-1, Math.min(1, (upper * upper + d * d - lower * lower) / (2 * upper * d))))
  const a = angle(shoulder, wrist) + side * bend
  return { x: shoulder.x + Math.cos(a) * upper, y: shoulder.y + Math.sin(a) * upper }
}

function armParts(rig: Rig, contact: WorkPoint, side: 'left' | 'right') {
  const mirror = side === 'left' ? 1 : -1
  const handRotation = Math.PI
  const wrist = { x: contact.x + (rig.hand.tip.x - rig.hand.root.x) * mirror,
    y: contact.y + rig.hand.tip.y - rig.hand.root.y }
  const shoulder = rig.shoulders[side]
  const elbow = solveWorkArm(shoulder, wrist, distance(rig.upper.root, rig.upper.tip), distance(rig.forearm.root, rig.forearm.tip), side === 'left' ? -1 : 1)
  if (!elbow) return undefined
  const segment = (part: Rig['upper'], from: WorkPoint, to: WorkPoint): WorkPartTransform => ({
    clip: part.clip, root: part.root, position: from, mirror,
    rotation: angle(from, to) - Math.atan2(part.tip.y - part.root.y, (part.tip.x - part.root.x) * mirror),
  })
  return [segment(rig.upper, shoulder, elbow), segment(rig.forearm, elbow, wrist),
    { clip: rig.hand.clip, root: rig.hand.root, position: wrist, rotation: handRotation, mirror } satisfies WorkPartTransform]
}

export function computerWorkTargets(surface: WorkSurface, elapsedMs: number) {
  const t = (Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0) % WORK_CYCLE_MS
  const phase = t < 5400 || t >= 11200 ? 'typing' : t < 6100 ? 'reach-mouse' : t < 8000 ? 'mouse' : t < 10500 ? 'review' : 'return-keyboard'
  const left = { ...surface.keyboardLeft }
  let right = { ...surface.keyboardRight }
  if (phase === 'typing') {
    const lift = (time: number) => { const local = time % 480; return local < 160 ? Math.sin(local / 160 * Math.PI) * 3 : 0 }
    const settle = t < 5400 ? smooth(Math.min(1, (5400 - t) / 160)) : 1
    left.y -= lift(t) * settle; right.y -= lift(t + 240) * settle
  } else if (phase === 'reach-mouse' || phase === 'return-keyboard') {
    const progress = phase === 'reach-mouse' ? (t - 5400) / 700 : (t - 10500) / 700
    right = phase === 'reach-mouse' ? mix(surface.keyboardRight, surface.mouse, smooth(progress)) : mix(surface.mouse, surface.keyboardRight, smooth(progress))
    right.y -= Math.sin(progress * Math.PI) * 4
  } else right = { ...surface.mouse }
  if (phase === 'mouse') right.x = Math.max(surface.bounds.left, Math.min(surface.bounds.right, right.x + Math.sin((t - 6100) / 1900 * Math.PI * 2) * 1.5))
  return { phase, left, right }
}

/** Match the leader's four-pose, three-second typing loop and one-second rest. */
export function quietWorkTargets(surface: WorkSurface, elapsedMs: number) {
  const t = (Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0) % QUIET_WORK_CYCLE_MS
  const pose = t < 3000 ? Math.floor(t / 250) % 4 : 0
  const left = { ...surface.keyboardLeft }, right = { ...surface.keyboardRight }
  if (pose === 1) left.y -= 1.5
  if (pose === 3) right.y -= 1.5
  return { phase: t < 3000 ? 'typing' : 'pause', left, right }
}

/** Preflight the entire reach so a marginal furniture fit cannot flicker mid-loop. */
export function canUseWorkSurface(rig: Rig, surface: WorkSurface) {
  if (!validWorkSurface(surface)) return false
  const upper = distance(rig.upper.root, rig.upper.tip), lower = distance(rig.forearm.root, rig.forearm.tip)
  const reachable = (side: 'left' | 'right', a: WorkPoint, b: WorkPoint, margin: number) => {
    const shoulder = rig.shoulders[side], mirror = side === 'left' ? 1 : -1
    const dx = (rig.hand.tip.x - rig.hand.root.x) * mirror, dy = rig.hand.tip.y - rig.hand.root.y
    const left = Math.min(a.x, b.x) - margin + dx, right = Math.max(a.x, b.x) + margin + dx
    const top = Math.min(a.y, b.y) - 4 + dy, bottom = Math.max(a.y, b.y) + dy
    const nearest = { x: Math.max(left, Math.min(right, shoulder.x)), y: Math.max(top, Math.min(bottom, shoulder.y)) }
    return distance(shoulder, nearest) >= Math.abs(upper - lower) + .1 &&
      [left, right].every(x => [top, bottom].every(y => distance(shoulder, { x, y }) <= upper + lower - .1))
  }
  // The complete target envelopes must lie in each arm's reachable annulus.
  return reachable('left', surface.keyboardLeft, surface.keyboardLeft, 0) && reachable('right', surface.keyboardRight, surface.mouse, 1.5)
}

export function sampleComputerWork(rig: Rig, surface: WorkSurface, elapsedMs: number) {
  if (!canUseWorkSurface(rig, surface)) return undefined
  const targets = computerWorkTargets(surface, elapsedMs)
  const left = armParts(rig, targets.left, 'left'), right = armParts(rig, targets.right, 'right')
  return left && right ? { phase: targets.phase, contacts: { left: targets.left, right: targets.right }, parts: [...left, ...right] } : undefined
}

export function canUseQuietSurface(rig: Rig, surface: WorkSurface) {
  if (!validWorkSurface(surface)) return false
  return [0, 250, 750].every(time => {
    const targets = quietWorkTargets(surface, time)
    return Boolean(armParts(rig, targets.left, 'left') && armParts(rig, targets.right, 'right'))
  })
}

export function sampleQuietWork(rig: Rig, surface: WorkSurface, elapsedMs: number) {
  if (!canUseQuietSurface(rig, surface)) return undefined
  const targets = quietWorkTargets(surface, elapsedMs)
  const left = armParts(rig, targets.left, 'left'), right = armParts(rig, targets.right, 'right')
  return left && right ? { phase: targets.phase, contacts: { left: targets.left, right: targets.right }, parts: [...left, ...right] } : undefined
}
