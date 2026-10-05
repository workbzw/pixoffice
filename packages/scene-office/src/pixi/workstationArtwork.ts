// Pixel alignment for existing artwork and the retained legacy scene, not world units.
export const WORKSTATION_DESK_OFFSET_Y = -8
export const WORKSTATION_SEAT_Y = 45

export function workstationPosition(index: number) {
  return { x: 380 + index % 2 * 200, y: 200 + Math.floor(index / 2) * 140 }
}
