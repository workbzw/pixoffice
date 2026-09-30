import { Container, FillGradient, Graphics, Rectangle, Sprite, Texture } from 'pixi.js'
import type { Desk } from '@/types/agent'
import { SEAT_OFFSET_Y } from '@/scene/layout/officeLayout'
import { WORKSTATION_DESK_OFFSET_Y } from '@/scene/layout/workstationArtwork'
import {
  getOfficeChairTexture,
  getOfficeDeskTexture,
} from '@/scene/assets/loadOfficeAssets'
import { getWorkstationTrialTextures } from '@/scene/assets/loadWorkstationTrialAssets'
import { CLASSIC_DESK, TRIAL_DESK, TRIAL_COMPUTER, classicDeskPlacement, workstationSurface } from '@/scene/layout/workstationSurface'
import { transformWorkSurface } from '@/scene/characters/workSurface'

export type WorkstationArtwork = 'classic' | 'trial'

const STYLE = {
  shadow: { color: 0x454543, alpha: 0.055 },
  deskTop: 0xfaf8f4,
  deskEdge: 0xe8e0d4,
  deskStroke: 0xd8d0c4,
  chairDark: 0x556b7d,
  chair: 0x7a8fa3,
  chairWheel: 0x3d4a56,
  monitor: 0x2e3238,
  screenTop: 0x7ec8ff,
  screenBottom: 0x4a8fd9,
  keyboard: 0xeeedea,
  keyboardStroke: 0xd0ccc4,
  mouse: 0xf5f4f1,
} as const

const CHAIR_BASE_WIDTH = 104
const CHAIR_ANCHOR_Y = 0.36
const CHAIR_TARGET_WIDTH = CHAIR_BASE_WIDTH / 2

const CHAIR_DEPTH_AHEAD = 2

export class DeskEntity {
  readonly deskId: string
  readonly shadowGfx = new Graphics()
  readonly deskLayer = new Container()
  readonly deskFrontLayer = new Container()
  readonly chairLayer = new Container()
  readonly occupiedIndicator = new Graphics()

  private desk: Desk
  private deskTextures: Texture[] = []
  private artwork: WorkstationArtwork = 'classic'
  private mountedArtwork: WorkstationArtwork | 'fallback' = 'fallback'

  constructor(desk: Desk) {
    this.deskId = desk.id
    this.desk = desk

    for (const part of [
      this.shadowGfx,
      this.deskLayer,
      this.deskFrontLayer,
      this.chairLayer,
      this.occupiedIndicator,
    ]) {
      part.position.set(desk.x, desk.y)
    }
    this.positionDesk()

    this.drawShadow()
    this.mountSprites()
    this.deskLayer.on('destroyed', () => this.deskTextures.forEach(texture => texture.destroy()))
  }

  /** 素材晚到或 HMR 后可重新挂载 PNG */
  remountSprites() {
    for (const layer of [this.deskLayer, this.deskFrontLayer, this.chairLayer]) layer.removeChildren().forEach(child => child.destroy({ children: true }))
    this.deskTextures.forEach(texture => texture.destroy())
    this.deskTextures = []
    this.mountSprites()
  }

  setArtwork(artwork: WorkstationArtwork) {
    if (artwork === this.artwork) return
    this.artwork = artwork
    this.remountSprites()
  }

  updateDepthZ() {
    const deskZ = this.desk.y + WORKSTATION_DESK_OFFSET_Y + 24
    const chairZ = this.desk.seatY + CHAIR_DEPTH_AHEAD
    this.deskLayer.zIndex = deskZ
    // A compact desk's projected feet can extend below the seat anchor, but its
    // legs and cabinet must still render behind the occupant and fixed chair back.
    this.deskFrontLayer.zIndex = Math.min(this.desk.y + WORKSTATION_DESK_OFFSET_Y + 56, this.desk.seatY - 1)
    this.shadowGfx.zIndex = deskZ - 0.5
    this.chairLayer.zIndex = chairZ
    this.occupiedIndicator.zIndex = chairZ + 0.5
  }

  setOccupied(occupied: boolean) {
    this.occupiedIndicator.clear()
    if (occupied) {
      this.occupiedIndicator.circle(0, SEAT_OFFSET_Y - 4, 5.5)
      this.occupiedIndicator.fill({ color: 0x50b86c, alpha: 0.85 })
      this.occupiedIndicator.stroke({ color: 0xffffff, width: 1.5, alpha: 0.6 })
    }
  }

  getSeatPosition() {
    return { x: this.desk.seatX, y: this.desk.seatY }
  }

  getWorkSurface() {
    return transformWorkSurface(workstationSurface(this.mountedArtwork), 1, this.desk.x, this.desk.y)
  }

  setDesk(desk: Desk) {
    this.desk = desk
    for (const part of [this.shadowGfx, this.deskLayer, this.deskFrontLayer, this.chairLayer, this.occupiedIndicator]) part.position.set(desk.x, desk.y)
    this.positionDesk()
  }

  private positionDesk() {
    for (const layer of [this.deskLayer, this.deskFrontLayer]) layer.y = this.desk.y + WORKSTATION_DESK_OFFSET_Y
  }

  private mountSprites() {
    if (this.artwork === 'trial' && this.mountTrialSprites()) return
    const deskTex = getOfficeDeskTexture()
    const chairTex = getOfficeChairTexture()

    if (deskTex) {
      this.mountedArtwork = 'classic'
      const { scale, split, apronY } = classicDeskPlacement(deskTex.width, deskTex.height)
      // Reuse the same GPU texture; only the tabletop and floor-level legs sort separately.
      for (const [top, bottom, layer] of [[0, split, this.deskLayer], [split, deskTex.height, this.deskFrontLayer]] as const) {
        const texture = new Texture({ source: deskTex.source, frame: new Rectangle(0, top, deskTex.width, bottom - top) })
        this.deskTextures.push(texture)
        const sprite = new Sprite(texture)
        sprite.anchor.set(.5, 0)
        const heightScale = top === 0 ? CLASSIC_DESK.topHeightScale : 1
        sprite.scale.set(scale, scale * heightScale)
        // Raise the monitor/table surface without moving the floor-level legs or cabinet.
        sprite.position.set(0, apronY + (top - split) * scale * heightScale)
        layer.addChild(sprite)
      }
    } else {
      this.mountedArtwork = 'fallback'
      this.drawDeskFallback()
    }

    if (chairTex) {
      const chair = new Sprite(chairTex)
      chair.anchor.set(0.5, CHAIR_ANCHOR_Y)
      chair.position.set(0, SEAT_OFFSET_Y)
      chair.scale.set(CHAIR_TARGET_WIDTH / chairTex.width)
      this.chairLayer.addChild(chair)
    } else {
      this.drawChairFallback()
    }
  }

  private mountTrialSprites() {
    const textures = getWorkstationTrialTextures()
    if (!textures) return false
    this.mountedArtwork = 'trial'
    const part = (source: Texture, frame: Rectangle, layer: Container, width: number, x: number, y: number) => {
      const texture = new Texture({ source: source.source, frame })
      this.deskTextures.push(texture)
      const sprite = new Sprite(texture)
      sprite.anchor.set(.5, 0)
      sprite.scale.set(width / frame.width)
      sprite.position.set(x, y)
      layer.addChild(sprite)
      return sprite
    }
    // Split at the apron without stretching either half. Existing ground depths stay unchanged.
    const d = TRIAL_DESK, c = TRIAL_COMPUTER, scale = d.targetWidth / d.width
    part(textures.desk, new Rectangle(d.left, d.top, d.width, d.apron - d.top), this.deskLayer, d.targetWidth, 0, d.apronY - (d.apron - d.top) * scale)
    part(textures.desk, new Rectangle(d.left, d.apron, d.width, d.bottom - d.apron), this.deskFrontLayer, d.targetWidth, 0, d.apronY)
    part(textures.computer, new Rectangle(c.left, c.top, c.width, c.height), this.deskLayer, c.targetWidth, 0, c.bottomY - c.height * c.targetWidth / c.width)
    part(textures.chair, new Rectangle(208, 323, 800, 894), this.chairLayer, 44, 0, SEAT_OFFSET_Y - 14)
    return true
  }

  private drawShadow() {
    const g = this.shadowGfx
    g.clear()
    g.ellipse(0, SEAT_OFFSET_Y + 27, 25, 6)
    g.fill(STYLE.shadow)
  }

  private drawChairFallback() {
    const g = new Graphics()
    const seatY = 30
    const backTop = 40
    const backBottom = 58
    const baseY = 64

    g.ellipse(0, baseY, 30, 11)
    g.fill(STYLE.chairDark)
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2
      g.circle(Math.cos(a) * 24, baseY + Math.sin(a) * 6, 3.5)
      g.fill(STYLE.chairWheel)
    }
    g.roundRect(-24, backTop, 48, backBottom - backTop, 14)
    g.fill(STYLE.chair)
    g.roundRect(-22, seatY, 44, 14, 8)
    g.fill(STYLE.chair)

    g.position.set(0, SEAT_OFFSET_Y - 36)
    this.chairLayer.addChild(g)
  }

  private drawDeskFallback() {
    const g = new Graphics()

    g.roundRect(-46, -6, 92, 34, 10)
    g.fill(STYLE.deskTop)
    g.stroke({ color: STYLE.deskStroke, width: 1.5, alpha: 0.55 })
    g.roundRect(-44, 22, 88, 8, 4)
    g.fill(STYLE.deskEdge)

    g.roundRect(-22, -48, 44, 30, 6)
    g.fill(STYLE.monitor)

    const screenGrad = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: STYLE.screenTop },
        { offset: 1, color: STYLE.screenBottom },
      ],
      textureSpace: 'local',
    })
    g.roundRect(-18, -44, 36, 22, 4)
    g.fill(screenGrad)

    g.roundRect(-20, 0, 40, 8, 4)
    g.fill(STYLE.keyboard)

    g.ellipse(18, 6, 5, 7)
    g.fill(STYLE.mouse)

    this.deskLayer.addChild(g)
  }
}
