export type WorldPoint = { x: number; y: number }
export type WorldBox = { left: number; top: number; right: number; bottom: number }
/** Ground-plane axes, independent of camera orientation. Positive y is south. */
export type WorldDirection = 'north' | 'east' | 'south' | 'west'
/** Existing v2 saves and commands retain these axis names. They are not sprite views. */
export type LegacyFacing = 'front' | 'back' | 'left' | 'right'

const directions: Record<LegacyFacing, WorldDirection> = { front: 'south', back: 'north', left: 'west', right: 'east' }
const facings: Record<WorldDirection, LegacyFacing> = { north: 'back', east: 'right', south: 'front', west: 'left' }
export const worldDirectionFromFacing = (facing: LegacyFacing): WorldDirection => directions[facing]
export const facingFromWorldDirection = (direction: WorldDirection): LegacyFacing => facings[direction]
export function worldDirectionToward(from: WorldPoint, to: WorldPoint): WorldDirection {
  const dx = to.x - from.x, dy = to.y - from.y
  return Math.abs(dx) >= Math.abs(dy) ? dx < 0 ? 'west' : 'east' : dy < 0 ? 'north' : 'south'
}
