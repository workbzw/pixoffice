import { Container, Graphics, Rectangle, Text } from 'pixi.js'
import type { Prop } from '@pixoffice/runtime/model'
import { PropViewRegistry } from '@pixoffice/renderer-pixi/PropViewRegistry'
import type { PropViewFactory } from '@pixoffice/renderer-pixi/PropViewRegistry'
import { DeskEntity } from './DeskEntity.ts'
import { propPixels } from '../projection.ts'

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
      desk.setOccupied(actors.some(a => a.furniture?.propId === p.id && a.furniture.seated && !a.furniture.transitioning))
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
export function createOfficePropViews(trialEnabled: () => boolean = () => true) {
  const registry = new PropViewRegistry()
  registry.register('workstation', workstationView(trialEnabled))
  registry.register('whiteboard', whiteboardView)
  return registry
}
