import { Container, Sprite } from 'pixi.js'
import type { Texture } from 'pixi.js'
import type { PropViewRegistry } from '@pixoffice/renderer-pixi'
import { CLASSROOM_ARTWORK, classroomCellCenter, classroomFurnitureLayout } from './alignment.ts'

function artwork(texture: Texture, sourceWidth: number) {
  const sprite = new Sprite(texture)
  sprite.scale.set(sourceWidth / texture.width)
  return sprite
}

export function createClassroomDeskView(deskTexture: Texture, chairTexture: Texture): ReturnType<PropViewRegistry['create']> {
  const desk = new Container(), chair = new Container()
  desk.label = 'classroom.desk'; chair.label = 'classroom.chair'
  desk.addChild(artwork(deskTexture, CLASSROOM_ARTWORK.desk.width))
  // The continuous rear shell is one foreground sprite: no cutouts or per-body masks.
  chair.addChild(artwork(chairTexture, CLASSROOM_ARTWORK.chair.width))
  return { roots: [desk, chair], hitTarget: desk, update(prop, template) {
    const seat = template.anchors.seat, ground = classroomCellCenter({ x: prop.position.x + seat.x, y: prop.position.y + seat.y })
    const layout = classroomFurnitureLayout(ground)
    desk.position.set(layout.desk.x, layout.desk.y); desk.scale.set(layout.desk.scale); desk.zIndex = layout.depth.desk
    chair.position.set(layout.chair.x, layout.chair.y); chair.scale.set(layout.chair.scale); chair.zIndex = layout.depth.chair
  } }
}
