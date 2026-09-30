import type { WorkSurface } from '../characters/workSurface'
import { WORKSTATION_DESK_OFFSET_Y, WORKSTATION_SEAT_Y } from './workstationArtwork'

export const CLASSIC_DESK = { width: 920, height: 582, targetWidth: 152 * 2 / 3, anchorY: .62, splitY: 310, topHeightScale: 1.5 }
export const TRIAL_DESK = { left: 92, top: 138, width: 1352, apron: 378, bottom: 894, targetWidth: 100, apronY: 26 }
export const TRIAL_COMPUTER = { left: 298, top: 112, width: 1004, height: 818, targetWidth: 52, bottomY: 21 }

export function classicDeskPlacement(width = CLASSIC_DESK.width, height = CLASSIC_DESK.height) {
  const scale = CLASSIC_DESK.targetWidth / width
  const split = Math.round(height * CLASSIC_DESK.splitY / CLASSIC_DESK.height)
  const apronY = WORKSTATION_SEAT_Y - 14 + (split - height * CLASSIC_DESK.anchorY) * scale
  return { scale, split, apronY, topY: apronY - split * scale * CLASSIC_DESK.topHeightScale }
}

/** Landmarks are measured in source artwork and use the furniture's drawing transform. */
export function workstationSurface(artwork: 'classic' | 'trial' | 'fallback'): WorkSurface {
  const offset = WORKSTATION_DESK_OFFSET_Y
  if (artwork === 'classic') {
    const { scale, topY } = classicDeskPlacement()
    const p = (x: number, y: number) => ({ x: (x - CLASSIC_DESK.width / 2) * scale,
      y: offset + topY + y * scale * CLASSIC_DESK.topHeightScale })
    return { keyboardLeft: p(385, 238), keyboardRight: p(505, 238), mouse: p(597, 235),
      bounds: { left: p(85, 156).x, right: p(830, 156).x, back: p(460, 156).y, front: p(460, 275).y } }
  }
  if (artwork === 'trial') {
    const c = TRIAL_COMPUTER, s = c.targetWidth / c.width
    const p = (x: number, y: number) => ({ x: (x - c.left - c.width / 2) * s,
      y: offset + c.bottomY - c.height * s + (y - c.top) * s })
    const d = TRIAL_DESK, ds = d.targetWidth / d.width
    return { keyboardLeft: p(570, 845), keyboardRight: p(855, 845), mouse: p(1212, 851),
      bounds: { left: -45, right: 45, back: offset + d.apronY - (d.apron - d.top) * ds,
        front: offset + d.apronY - (d.apron - 350) * ds } }
  }
  return { keyboardLeft: { x: -10, y: offset + 4 }, keyboardRight: { x: 2, y: offset + 4 }, mouse: { x: 18, y: offset + 6 },
    bounds: { left: -46, right: 46, back: offset - 6, front: offset + 22 } }
}
