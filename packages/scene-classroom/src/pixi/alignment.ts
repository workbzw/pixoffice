import type { Actor, Point } from '@pixoffice/runtime'

export const CLASSROOM_CELL = 50
export const CLASSROOM_CONTENT_SCALE = 1.4
export const classroomCellCenter = (point: Point) => ({ x: (point.x + .5) * CLASSROOM_CELL, y: (point.y + .5) * CLASSROOM_CELL })

// Source-frame landmarks, not bounding boxes: every pose keeps the same scale.
export const CLASSROOM_CHARACTER = {
  height: 112 * CLASSROOM_CONTENT_SCALE, teacherHeight: 120 * CLASSROOM_CONTENT_SCALE,
  referenceHeight: 280, pivotY: 344, seatedFootY: 377,
  seatedSeatY: 351.5, seatedHandY: 289,
} as const
const characterScale = CLASSROOM_CHARACTER.height / CLASSROOM_CHARACTER.referenceHeight
// The standing lane uses the cell centre; the chair occupies its rear half.
// These are presentation pixels, not extra/fractional runtime grid coordinates.
export const CLASSROOM_SEAT_RECESS = 5 * CLASSROOM_CONTENT_SCALE
export const CLASSROOM_SEATED_OFFSET = CLASSROOM_SEAT_RECESS - (CLASSROOM_CHARACTER.seatedFootY - CLASSROOM_CHARACTER.pivotY) * characterScale

export const CLASSROOM_ARTWORK = {
  desk: { file: 'desk-v5.webp', width: 1536, height: 1024, visibleWidth: 1200, displayWidth: 90 * CLASSROOM_CONTENT_SCALE,
    contact: { x: 768, y: 400 }, frontFootY: 823, nearEdgeY: 460 },
  chair: { file: 'chair-solid-v2.webp', width: 1254, height: 1254, visibleWidth: 815, displayWidth: 48 * CLASSROOM_CONTENT_SCALE,
    contact: { x: 627, y: 600 }, frontFootY: 1080, rearFootY: 884, backrestTopY: 85 },
} as const

export function classroomFurnitureLayout(ground: Point) {
  const seatedY = ground.y + CLASSROOM_SEATED_OFFSET
  // Seat contact is the underside of the seated hips, not the pelvis centre.
  const seat = { x: ground.x, y: seatedY + (CLASSROOM_CHARACTER.seatedSeatY - CLASSROOM_CHARACTER.pivotY) * characterScale }
  const placement = (art: typeof CLASSROOM_ARTWORK.desk | typeof CLASSROOM_ARTWORK.chair, contact: Point) => {
    const scale = art.displayWidth / art.visibleWidth
    return { x: contact.x - art.contact.x * scale, y: contact.y - art.contact.y * scale, scale }
  }
  const deskArt = CLASSROOM_ARTWORK.desk, deskScale = deskArt.displayWidth / deskArt.visibleWidth
  // Calibrate floor clearance and tabletop height independently of the grid row edge.
  // The rear row is a reserved docking passage, not an entire empty cell of air.
  const deskFloor = { x: ground.x, y: ground.y - 10 * CLASSROOM_CONTENT_SCALE }
  const desk = { x: ground.x - deskArt.contact.x * deskScale, y: deskFloor.y - deskArt.frontFootY * deskScale, scale: deskScale }
  const surface = { x: ground.x, y: desk.y + deskArt.contact.y * deskScale }
  return { seat, surface, desk, chair: placement(CLASSROOM_ARTWORK.chair, seat), standing: ground,
    depth: { desk: deskFloor.y, occupant: ground.y, chair: ground.y + CLASSROOM_SEAT_RECESS + CLASSROOM_CONTENT_SCALE } }
}

export function classroomActorGeometry(actor: Actor) {
  const step = actor.step, progress = step ? Math.min(1, step.elapsedMs / step.durationMs) : 0
  const point = step ? { x: step.from.x + (step.to.x - step.from.x) * progress, y: step.from.y + (step.to.y - step.from.y) * progress } : actor.position
  const ground = classroomCellCenter(point), transition = actor.seatTransition
  const posture = transition?.stage === 'sitting' || transition?.stage === 'rising'
  const seatedAmount = posture ? transition.seatedAmount : actor.posture === 'seated' && !step ? 1 : 0
  return { position: { x: ground.x, y: ground.y + CLASSROOM_SEATED_OFFSET * seatedAmount }, depth: ground.y }
}
