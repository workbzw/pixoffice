import type { Actor, Template, World } from './model.ts'
import { SceneFault } from './protocol.ts'

export function restoreBoundActor(world: World, actor: Actor, template: (id: string) => Template) {
  const prop = world.props.find(item => item.id === actor.homeId)
  if (!prop) throw new SceneFault('MISSING_BINDING', `${actor.name}绑定的物品不存在`)
  const definition = template(prop.templateId), port = definition.interactions?.seat
  if (!port) throw new SceneFault('INVALID_BINDING', `${actor.name}绑定的物品没有座位交互`)
  const offset = prop.anchors?.[port.anchor] ?? definition.anchors[port.anchor]
  actor.position = { x: prop.position.x + offset.x, y: prop.position.y + offset.y }
  actor.posture = port.posture; actor.facing = port.facing
  actor.using = { propId: prop.id, interactionId: 'seat' }
}

export function restoreInteractionFacing(world: World, actor: Actor, template: (id: string) => Template) {
  const using = actor.using, prop = using && world.props.find(item => item.id === using.propId)
  const port = prop && template(prop.templateId).interactions?.[using!.interactionId]
  if (port) actor.facing = port.facing
}
