import { Container, Graphics, Rectangle, Text } from 'pixi.js'
import type { Prop, Template } from '@/runtime/model'
import type { Agent } from '@/types/agent'
import { DeskEntity } from '../entities/DeskEntity'
import { CELL_PIXELS, propPixels } from '../gridProjection'
import type { WorkSurface } from '../characters/workSurface'

export interface PropView {
  roots: Container[]
  hitTarget: Container
  getWorkSurface?(): WorkSurface
  update(prop: Prop, template: Template, actors: Agent[]): void
}
export type PropViewFactory = (prop: Prop, template: Template) => PropView

const workstationView = (trialEnabled: () => boolean): PropViewFactory => prop => {
  const asDesk = (p: Prop) => { const pixel = propPixels(p); return { id: p.id, ...pixel, seatX: pixel.x, seatY: pixel.y + 45 } }
  const desk = new DeskEntity(asDesk(prop))
  desk.deskLayer.hitArea = new Rectangle(-55, -12, 110, 80)
  return { roots: [desk.shadowGfx, desk.deskLayer, desk.chairLayer, desk.occupiedIndicator, desk.deskFrontLayer], hitTarget: desk.deskLayer,
    getWorkSurface: () => desk.getWorkSurface(),
    update(p, _template, actors) {
      desk.setArtwork(trialEnabled() ? 'trial' : 'classic')
      desk.setDesk(asDesk(p))
      desk.updateDepthZ()
      desk.setOccupied(actors.some(a => a.assignedDeskId === p.id && a.seated && !a.seatTransition))
    } }
}
const whiteboardView: PropViewFactory = () => {
  const root = new Container(), board = new Graphics()
  board.roundRect(-56, -82, 112, 74, 3).fill(0xfefefe).stroke({ color: 0xb6b9b6, width: 2 })
  board.moveTo(-40, -8).lineTo(-44, 10).moveTo(40, -8).lineTo(44, 10).stroke({ color: 0xa6aaa8, width: 3 })
  const title = new Text({ text: '', style: { fontFamily: 'system-ui', fontSize: 11, fill: 0x333a35, fontWeight: '600', wordWrap: true, wordWrapWidth: 96 } })
  const body = new Text({ text: '', style: { fontFamily: 'system-ui', fontSize: 9, fill: 0x5d655f, wordWrap: true, wordWrapWidth: 96 } })
  title.position.set(-48, -75); body.position.set(-48, -52)
  root.addChild(board, title, body); root.hitArea = new Rectangle(-58, -84, 116, 96)
  return { roots: [root], hitTarget: root, update(prop) {
    const p = propPixels(prop); root.position.set(p.x, p.y); root.zIndex = p.y
    title.text = String(prop.state.title ?? '').slice(0, 8); body.text = String(prop.state.text ?? '').slice(0, 32)
  } }
}
const placeholderView: PropViewFactory = (prop, template) => {
  const root = new Container(), graphic = new Graphics(), bounds = template.footprint
  graphic.rect(bounds.left * CELL_PIXELS, bounds.top * CELL_PIXELS, (bounds.right - bounds.left) * CELL_PIXELS, (bounds.bottom - bounds.top) * CELL_PIXELS).fill({ color: 0xdce2de, alpha: .6 }).stroke({ color: 0x8c968f, width: 1 })
  const label = new Text({ text: prop.name, style: { fontSize: 10, fill: 0x67766b, wordWrap: true, wordWrapWidth: 90 } })
  label.anchor.set(.5, 1); root.addChild(graphic, label)
  return { roots: [root], hitTarget: root, update(p) { root.position.set(p.position.x * CELL_PIXELS, p.position.y * CELL_PIXELS); root.zIndex = p.position.y * CELL_PIXELS } }
}

/** Trusted view factories are assembled by the application, never downloaded by commands. */
export class PropViewRegistry {
  private factories = new Map<string, PropViewFactory>()
  register(id: string, factory: PropViewFactory) {
    if (this.factories.has(id)) throw new Error(`Duplicate view: ${id}`)
    this.factories.set(id, factory)
  }
  create(prop: Prop, template: Template): PropView { return (this.factories.get(template.view) ?? placeholderView)(prop, template) }
}
export function createOfficePropViews(trialEnabled: () => boolean = () => true) {
  const registry = new PropViewRegistry()
  registry.register('workstation', workstationView(trialEnabled))
  registry.register('whiteboard', whiteboardView)
  return registry
}
