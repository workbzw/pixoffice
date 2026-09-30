import { z } from 'zod'
import type { Template, World } from '../model'
import type { NavigationAdapter } from '../navigationAdapter'
import { SceneFault } from '../protocol'
import { cellDistance, sameCell } from './furnitureGrid'

const point = z.object({ x: z.number().finite(), y: z.number().finite() })
const legacyWorld = z.object({ sceneId: z.string(), width: z.literal(960), height: z.literal(640), layoutRevision: z.number().int(),
  actors: z.array(z.object({ id: z.string(), name: z.string(), templateId: z.string(), color: z.number(), homeId: z.string().optional(), position: point,
    presentation: z.object({ status: z.enum(['idle', 'working', 'thinking']), title: z.string(), sourceRevision: z.number().int() }) })),
  props: z.array(z.object({ id: z.string(), name: z.string(), templateId: z.string(), position: point, state: z.record(z.string(), z.unknown()), stateRevision: z.number().int() })),
  blockedAreas: z.array(z.object({ id: z.string(), name: z.string(), bounds: z.object({ left: z.number(), right: z.number(), top: z.number(), bottom: z.number() }) })).optional(),
})

/** v1 pixels are read only here. Runtime and v2 documents never retain these units. */
export function migrateLegacyWorld(raw: unknown, defaults: World, template: (id: string) => Template, navigation: NavigationAdapter): World {
  const old = legacyWorld.parse(raw)
  if (old.sceneId !== defaults.sceneId) throw new SceneFault('MAP_MISMATCH', '旧地图不属于当前场景')
  const world = structuredClone(defaults)
  world.layoutRevision = old.layoutRevision + 1; world.props = []; world.actors = []
  world.blockedAreas = old.blockedAreas?.map(a => ({ ...a, bounds: { left: Math.floor(a.bounds.left / 50), right: Math.ceil(a.bounds.right / 50), top: Math.floor(a.bounds.top / 50), bottom: Math.ceil(a.bounds.bottom / 50) } }))
  const cells = []
  for (let y = world.bounds.top; y < world.bounds.bottom; y++) for (let x = world.bounds.left; x < world.bounds.right; x++) cells.push({ x, y })
  for (const prop of old.props) {
    template(prop.templateId)
    const target = { x: Math.round((prop.position.x - 50) / 50), y: Math.round((prop.position.y - (prop.templateId === 'office.workstation' ? 20 : 25)) / 50) }
    const positions = [...cells].sort((a, b) => cellDistance(a, target) - cellDistance(b, target) || a.y - b.y || a.x - b.x)
    const position = positions.find(position => {
      try { navigation.validate({ ...world, props: [...world.props, { ...prop, position }] }, { connectivity: false }); return true } catch { return false }
    })
    if (!position) throw new SceneFault('MIGRATION_NO_SPACE', `旧家具「${prop.name}」没有可用的整格位置，原存档未修改`)
    world.props.push({ ...prop, position })
  }
  for (const actor of old.actors) {
    if (!defaults.actors.some(a => a.id === actor.id && a.templateId === actor.templateId)) throw new SceneFault('MAP_MISMATCH', '旧人物素材不匹配')
    const position = actor.homeId ? navigation.anchor(world, actor.homeId, 'seat')
      : [...cells].sort((a, b) => cellDistance(a, { x: Math.round(actor.position.x / 50), y: Math.round(actor.position.y / 50) }) - cellDistance(b, { x: Math.round(actor.position.x / 50), y: Math.round(actor.position.y / 50) })).find(p => navigation.walkable(world, p) && !world.actors.some(a => sameCell(a.position, p)))
    if (!position) throw new SceneFault('MIGRATION_NO_SPACE', `${actor.name}没有可用的站位格`)
    world.actors.push({ ...actor, position, facing: 'back', posture: actor.homeId ? 'seated' : 'standing', using: actor.homeId ? { propId: actor.homeId, interactionId: 'seat' } : undefined })
  }
  return world
}
