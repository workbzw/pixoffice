import type { Point, Template, World } from '../model'
import type { NavigationAdapter } from '../navigationAdapter'
import { SceneFault, sceneError } from '../protocol'
import type { SceneError } from '../protocol'
import { mapDocumentSchema } from './schema'
import type { MapDocument, MapOperation } from './schema'
import { validateFurnitureFootprints } from './furnitureGrid'
import { compactPath } from '../orthogonalPath'

export type MapDraftSnapshot = { id: string; revision: number; baseLayoutRevision: number; document: MapDocument; canUndo: boolean; canRedo: boolean;
  validation: { valid: boolean; error?: SceneError }; route?: { from: Point; to: Point; points: Point[]; distance: number; turns: number; error?: SceneError } }

export function exportMap(world: World): MapDocument {
  const b = world.bounds
  return structuredClone({ format: 'ai-office-map', version: 2, unit: 'cell', sceneId: world.sceneId, width: world.width, height: world.height, gridSize: 1, bounds: b,
    walkableArea: world.walkableArea ?? [{ x: b.left, y: b.top }, { x: b.right, y: b.top }, { x: b.right, y: b.bottom }, { x: b.left, y: b.bottom }],
    blockedAreas: world.blockedAreas ?? [], props: world.props.map(({ id, name, templateId, position, anchors }) => ({ id, name, templateId, position, ...(anchors ? { anchors } : {}) })),
    bindings: world.actors.map(a => ({ actorId: a.id, homeId: a.homeId ?? null, position: a.position })) })
}

export function materializeMap(document: MapDocument, current: World, template: (id: string) => Template): World {
  if (document.sceneId !== current.sceneId || document.width !== current.width || document.height !== current.height) throw new SceneFault('MAP_MISMATCH', '地图必须属于当前场景，且画布尺寸一致')
  if ((['left', 'top', 'right', 'bottom'] as const).some(key => document.bounds[key] !== current.bounds[key])) throw new SceneFault('MAP_MISMATCH', '地图不能修改背景画布的摆放边界')
  const ids = [...document.props, ...document.blockedAreas].map(p => p.id)
  if (new Set(ids).size !== ids.length || ids.some(id => current.actors.some(a => a.id === id))) throw new SceneFault('DUPLICATE_ENTITY', '地图对象 ID 重复')
  if (document.bindings.length !== current.actors.length || new Set(document.bindings.map(b => b.actorId)).size !== current.actors.length || document.bindings.some(b => !current.actors.some(a => a.id === b.actorId))) throw new SceneFault('INVALID_BINDINGS', '地图须包含当前全部人物的绑定信息')
  const world = structuredClone(current)
  world.gridSize = document.gridSize; world.walkableArea = structuredClone(document.walkableArea); world.blockedAreas = structuredClone(document.blockedAreas)
  world.props = document.props.map(p => {
    const t = template(p.templateId), old = current.props.find(item => item.id === p.id)
    if (old && old.templateId !== p.templateId) throw new SceneFault('TEMPLATE_CONFLICT', '已有物品不能替换模板，请使用新的物品 ID')
    for (const key of Object.keys(p.anchors ?? {})) {
      if (!Object.hasOwn(t.anchors, key)) throw new SceneFault('ANCHOR_NOT_FOUND', `${p.id}:${key}`)
      const seat = t.interactions?.seat
      if (seat && (key.startsWith('seat') || [seat.anchor, ...seat.approaches].includes(key))) throw new SceneFault('FIXED_SEAT_ANCHOR', '入座通道与桌椅素材绑定，不能单独移动')
    }
    return { ...structuredClone(p), state: structuredClone(old?.state ?? {}), stateRevision: old?.stateRevision ?? 0 }
  })
  world.actors.forEach(actor => {
    const binding = document.bindings.find(b => b.actorId === actor.id)!
    actor.homeId = binding.homeId ?? undefined
    actor.position = { ...binding.position }; actor.posture = 'standing'
    if (actor.homeId) {
      const prop = world.props.find(p => p.id === actor.homeId)
      if (!prop) throw new SceneFault('MISSING_BINDING', `${actor.name}绑定的工位已被删除`)
      const seat = template(prop.templateId).interactions?.seat
      if (!seat) throw new SceneFault('INVALID_BINDING', `${actor.name}只能绑定有座位的物品`)
      const offset = template(prop.templateId).anchors[seat.anchor]
      actor.position = { x: prop.position.x + offset.x, y: prop.position.y + offset.y }; actor.posture = 'seated'; actor.facing = seat.facing
    }
    actor.motion = undefined; actor.step = undefined; actor.using = actor.homeId ? { propId: actor.homeId, interactionId: 'seat' } : undefined
    actor.seatTransition = undefined; actor.speech = undefined; actor.expression = undefined
  })
  return world
}

/** Domain-only transaction. Pointer gestures and HTTP commands share this history. */
export class MapDraft {
  readonly id: string
  readonly baseLayoutRevision: number
  private revision = 0
  private document: MapDocument
  private past: MapDocument[] = []
  private future: MapDocument[] = []
  private validation: MapDraftSnapshot['validation'] = { valid: false }
  private route?: MapDraftSnapshot['route']
  private navigation: NavigationAdapter
  private template: (id: string) => Template
  constructor(world: World, id: string, navigation: NavigationAdapter, template: (id: string) => Template) {
    this.navigation = navigation; this.template = template
    this.id = id; this.baseLayoutRevision = world.layoutRevision; this.document = exportMap(world); this.validate(world)
  }
  assertRevision(id: string, revision: number) {
    if (id !== this.id) throw new SceneFault('DRAFT_NOT_FOUND', '草稿已关闭或被替换')
    if (revision !== this.revision) throw new SceneFault('DRAFT_CONFLICT', '草稿已被其他操作更新，请读取最新草稿后重试')
  }
  snapshot(): MapDraftSnapshot { return structuredClone({ id: this.id, revision: this.revision, baseLayoutRevision: this.baseLayoutRevision, document: this.document, canUndo: this.past.length > 0, canRedo: this.future.length > 0, validation: this.validation, route: this.route }) }
  world(current: World) { return materializeMap(this.document, current, this.template) }
  patch(operations: MapOperation[], current: World, requireValid = false) {
    let next = structuredClone(this.document)
    for (const op of operations) {
      switch (op.op) {
        case 'map.replace': next = structuredClone(op.document); break
        case 'floor.set': next.walkableArea = structuredClone(op.points); break
        case 'prop.put': { const index = next.props.findIndex(p => p.id === op.prop.id); if (index < 0) next.props.push(structuredClone(op.prop)); else next.props[index] = structuredClone(op.prop); break }
        case 'prop.remove': next.props = next.props.filter(p => p.id !== op.id); break
        case 'blocked.put': { const index = next.blockedAreas.findIndex(p => p.id === op.area.id); if (index < 0) next.blockedAreas.push(structuredClone(op.area)); else next.blockedAreas[index] = structuredClone(op.area); break }
        case 'blocked.remove': next.blockedAreas = next.blockedAreas.filter(p => p.id !== op.id); break
        case 'binding.set': {
          const binding = next.bindings.find(b => b.actorId === op.actorId)
          if (!binding) throw new SceneFault('ENTITY_NOT_FOUND', op.actorId)
          binding.homeId = op.homeId; if (op.position) binding.position = { ...op.position }; break
        }
      }
    }
    next = mapDocumentSchema.parse(next)
    // Structural errors are atomic failures; geometric errors remain editable drafts.
    const world = materializeMap(next, current, this.template)
    if (requireValid) { validateFurnitureFootprints(world, this.template); this.navigation.validate(world) }
    this.past.push(this.document); if (this.past.length > 50) this.past.shift()
    this.document = next; this.future = []; this.changed(current, requireValid)
  }
  undo(current: World) {
    const next = this.past.pop(); if (!next) throw new SceneFault('NO_UNDO', '没有可撤销的修改')
    this.future.push(this.document); this.document = next; this.changed(current)
  }
  redo(current: World) {
    const next = this.future.pop(); if (!next) throw new SceneFault('NO_REDO', '没有可重做的修改')
    this.past.push(this.document); this.document = next; this.changed(current)
  }
  private changed(current: World, validated = false) {
    this.revision++; this.route = undefined
    if (validated) this.validation = { valid: true }; else this.validate(current)
  }
  validate(current: World) {
    try {
      const world = this.world(current)
      validateFurnitureFootprints(world, this.template); this.navigation.validate(world); this.validation = { valid: true }
    }
    catch (error) { this.validation = { valid: false, error: sceneError(error) } }
    return this.validation
  }
  previewRoute(current: World, from: Point, to: Point) {
    try {
      const points = [from, ...this.navigation.path(this.world(current), from, to)]
      const distance = points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0)
      this.route = { from, to, points, distance, turns: Math.max(0, compactPath(points).length - 2) }
    } catch (error) { this.route = { from, to, points: [], distance: 0, turns: 0, error: sceneError(error) } }
  }
}
