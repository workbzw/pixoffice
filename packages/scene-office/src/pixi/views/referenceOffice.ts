import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js'
import type { WorkSurface } from '@pixoffice/contracts/contactSurface'
import type { Point, Prop } from '@pixoffice/runtime/model'
import type { PropViewFactory } from '@pixoffice/renderer-pixi/PropViewRegistry'
import { transformWorkSurface } from '@pixoffice/contracts/contactSurface'
import { createOfficePropViews } from './index.ts'
import { DeskEntity } from './DeskEntity.ts'
import { seatPixels } from '../projection.ts'
import { TRIAL_COMPUTER, TRIAL_MONITOR_RIGHT, trialComputerPlacement } from '../workstationSurface.ts'
import { WORKSTATION_DESK_OFFSET_Y, WORKSTATION_SEAT_Y } from '../workstationArtwork.ts'
import { getReferenceOfficeTexture } from '../assets/loadReferenceOfficeAssets.ts'
import { renderWhiteboardPreview, WHITEBOARD_PREVIEW_LAYOUT } from '../../taskBoard.ts'
import { whiteboardTaskBoard, WhiteboardProgress } from '../../whiteboard.ts'
import type { WhiteboardTaskBoardData } from '../../whiteboard.ts'
import { WhiteboardContent } from './WhiteboardContent.ts'

const SCALE = 1.5

export function referenceMonitorAnchor(position: Point, placement: 'above' | 'right' = 'above', workstationScale = SCALE): Point {
  const seat = seatPixels({ x: position.x + 1, y: position.y + 2 })
  const top = seat.y + workstationScale * (-WORKSTATION_SEAT_Y + WORKSTATION_DESK_OFFSET_Y + trialComputerPlacement().topY)
  if (placement === 'right') {
    const computer = TRIAL_COMPUTER, scale = computer.targetWidth / computer.width * workstationScale
    return { x: seat.x + (TRIAL_MONITOR_RIGHT.x - computer.left - computer.width / 2) * scale + 6,
      y: top + (TRIAL_MONITOR_RIGHT.y - computer.top) * scale }
  }
  return { x: seat.x, y: top - 14 }
}

const ACCESSORY_FRAMES = {
  plant: { x: 45, y: 133, width: 381, height: 474 },
  mug: { x: 1467, y: 374, width: 231, height: 222 },
  books: { x: 1728, y: 185, width: 314, height: 446 },
} as const

export function referenceAccessoryPlacements(surface: WorkSurface, scale = 1) {
  const { left, right, back, front } = surface.bounds
  return [
    { id: 'plant' as const, width: 26 * scale, x: left + 16 * scale, y: back + 13 * scale },
    { id: 'mug' as const, width: 14 * scale, x: right - 28 * scale, y: back + 8 * scale },
    { id: 'books' as const, width: 26 * scale, x: right - 13 * scale, y: front - 3 * scale },
  ]
}

export const createReferenceWorkstationView = (scale = SCALE): PropViewFactory => prop => {
  const seat = (p: Prop) => seatPixels({ x: p.position.x + 1, y: p.position.y + 2 })
  const asDesk = (p: Prop) => { const s = seat(p); return { id: p.id, x: s.x, y: s.y - WORKSTATION_SEAT_Y, seatX: s.x, seatY: s.y } }
  const desk = new DeskEntity(asDesk(prop)), accessories = new Container()
  const texture = getReferenceOfficeTexture('desk-accessories')
  const sprites = new Map<string, Sprite>(), crops: Texture[] = []
  if (texture) {
    for (const [id, frame] of Object.entries(ACCESSORY_FRAMES)) {
      const cropped = new Texture({ source: texture.source, frame: new Rectangle(frame.x, frame.y, frame.width, frame.height) })
      crops.push(cropped)
      const sprite = new Sprite(cropped)
      sprite.anchor.set(.5, 1)
      sprites.set(id, sprite); accessories.addChild(sprite)
    }
  }
  accessories.on('destroyed', () => crops.forEach(crop => crop.destroy()))
  const workSurface = () => { const s = seat(prop); return transformWorkSurface(desk.getWorkSurface(), scale, s.x * (1 - scale), s.y * (1 - scale)) }
  const parts = [desk.shadowGfx, desk.deskLayer, desk.chairLayer, desk.occupiedIndicator, desk.deskFrontLayer]
  desk.deskLayer.hitArea = new Rectangle(-55, -12, 110, 80)
  return { roots: [...parts, accessories], hitTarget: desk.deskLayer,
    getWorkSurface: workSurface,
    update(p, _template, actors) {
      prop = p
      desk.setArtwork('trial'); desk.setDesk(asDesk(p)); desk.updateDepthZ()
      desk.setOccupied(actors.some(a => a.furniture?.propId === p.id && a.furniture.seated && !a.furniture.transitioning))
      const s = seat(p)
      for (const part of parts) { part.position.set(s.x + (part.x - s.x) * scale, s.y + (part.y - s.y) * scale); part.scale.set(scale) }
      accessories.position.set(s.x, s.y); accessories.zIndex = desk.deskLayer.zIndex + .1
      for (const part of referenceAccessoryPlacements(workSurface(), scale / SCALE)) {
        const sprite = sprites.get(part.id)
        if (!sprite) continue
        sprite.width = part.width; sprite.scale.y = sprite.scale.x
        sprite.position.set(part.x - s.x, part.y - s.y)
      }
    } }
}

export const referenceWorkstationView = createReferenceWorkstationView()

const conferenceTableView: PropViewFactory = () => {
  const root = new Container(), texture = getReferenceOfficeTexture('conference-table')
  if (texture) {
    const sprite = new Sprite(texture)
    sprite.anchor.set(.5, 1); sprite.width = 430; sprite.scale.y = sprite.scale.x
    root.addChild(sprite)
  }
  root.hitArea = new Rectangle(-215, -180, 430, 180)
  return { roots: [root], hitTarget: root, update(prop) {
    root.position.set((prop.position.x + 4) * 50, (prop.position.y + 3) * 50 - 10)
    root.zIndex = (prop.position.y + 1.5) * 50
  } }
}

export interface ReferenceWhiteboardPlacement {
  x: number; y: number; scale: number
  frame: { x: number; y: number; width: number; height: number }
  layout: { width: number; height: number; fontSize: number }
  artwork?: string
}
const defaultWhiteboardPlacement: ReferenceWhiteboardPlacement = {
  x: 48, y: -160, scale: 435 / WHITEBOARD_PREVIEW_LAYOUT.width,
  frame: { x: 30, y: -165, width: 472, height: 181 }, layout: WHITEBOARD_PREVIEW_LAYOUT,
}

const wallWhiteboardView = (progress: WhiteboardProgress, placement: ReferenceWhiteboardPlacement): PropViewFactory => () => {
  const root = new Container()
  if (placement.artwork) {
    const texture = getReferenceOfficeTexture(placement.artwork)
    if (texture) {
      const frame = placement.frame
      const cropped = new Texture({ source: texture.source, frame: new Rectangle(40, 36, 2020, 678) })
      const sprite = new Sprite(cropped)
      sprite.position.set(frame.x, frame.y); sprite.width = frame.width; sprite.height = frame.height
      const mask = new Graphics().roundRect(frame.x, frame.y, frame.width, frame.height, 8).fill(0xffffff)
      sprite.mask = mask
      root.addChild(sprite, mask)
      root.on('destroyed', () => cropped.destroy())
    }
  }
  const content = new WhiteboardContent({ text: '', resolution: 2, style: { fontFamily: 'system-ui, sans-serif', fontSize: placement.layout.fontSize,
    fill: 0x343b36, whiteSpace: 'normal', wordWrap: true, wordWrapWidth: placement.layout.width,
    cssOverrides: ['font-size:inherit', 'line-height:inherit', 'color:inherit'] } })
  content.position.set(placement.x, placement.y)
  content.scale.set(placement.scale)
  // Ordinary rooms retain their baked frame; adaptive rooms mount a separate frame above the wall.
  const { x, y, width, height } = placement.frame
  root.addChild(content); root.hitArea = new Rectangle(x, y, width, height)
  let previous = '', elapsed = 0, revision = -1, boardId = '', board: WhiteboardTaskBoardData | undefined
  const paint = () => {
    const state = board ? { taskBoard: progress.project(boardId, board) } : {}
    const key = JSON.stringify(state)
    if (key === previous) return
    previous = key
    content.text = renderWhiteboardPreview(state, placement.layout)
  }
  return { roots: [root], hitTarget: root, whenReady: () => content.whenReady(), update(prop) {
    root.position.set(prop.position.x * 50, prop.position.y * 50); root.zIndex = prop.position.y * 50
    if (revision !== prop.stateRevision || boardId !== prop.id) {
      revision = prop.stateRevision; boardId = prop.id; board = whiteboardTaskBoard(prop.state) ?? undefined
      paint()
    }
  }, updateFrame(dt) {
    elapsed += dt
    // HTML textures refresh at most four times a second, and only when a visible value changes.
    if (elapsed < .25) return
    elapsed %= .25
    paint()
  } }
}

export function createReferenceOfficePropViews(progress = new WhiteboardProgress(), whiteboard = defaultWhiteboardPlacement, workstationScale = SCALE) {
  const registry = createOfficePropViews()
  registry.register('reference-workstation', createReferenceWorkstationView(workstationScale))
  registry.register('wall-whiteboard', wallWhiteboardView(progress, whiteboard))
  registry.register('conference-table', conferenceTableView)
  return registry
}
