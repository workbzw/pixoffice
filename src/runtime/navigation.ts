import PF from 'pathfinding'
import type { Point, World } from './model'
import type { NavigationAdapter, NavigationQuery, NavigationTemplates } from './navigationAdapter'
import { SceneFault } from './protocol'
import { compactPath, comparePaths, elbowPaths, shortenPath } from './orthogonalPath'
import { convexAreaContains } from './walkableArea'
import { addCell, cellKey, isCell, sameCell, furnitureCells, validateFurnitureFootprints } from './map/furnitureGrid'

export class GridNavigation implements NavigationAdapter {
  private templates: NavigationTemplates
  constructor(templates: NavigationTemplates) { this.templates = templates }

  anchor(world: World, targetId: string, anchor: string): Point {
    const prop = world.props.find(p => p.id === targetId)
    if (!prop) throw new SceneFault('ENTITY_NOT_FOUND', targetId)
    const offset = prop.anchors?.[anchor] ?? this.templates.template(prop.templateId).anchors[anchor]
    if (!offset || !isCell(offset)) throw new SceneFault('ANCHOR_NOT_FOUND', `${targetId}:${anchor}`)
    return addCell(prop.position, offset)
  }

  onFloor(world: World, p: Point) {
    const b = world.bounds
    if (!isCell(p) || p.x < b.left || p.x >= b.right || p.y < b.top || p.y >= b.bottom) return false
    // Polygon edges describe tile borders. Only complete floor tiles are usable.
    const inside = world.walkableArea && convexAreaContains(world.walkableArea)
    return !inside || [p, { x: p.x + 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x + 1, y: p.y + 1 }].every(c => inside(c))
  }

  walkable(world: World, p: Point, query: NavigationQuery = {}) {
    if (!this.onFloor(world, p)) return false
    if (query.within && !query.within.some(c => sameCell(c, p))) return false
    if (query.obstacles?.some(o => sameCell(o.position, p))) return false
    if (world.blockedAreas?.some(a => p.x >= a.bounds.left && p.x < a.bounds.right && p.y >= a.bounds.top && p.y < a.bounds.bottom)) return false
    if (query.contact) {
      const prop = world.props.find(p => p.id === query.contact!.propId)
      if (!prop || !this.templates.template(prop.templateId).interactions?.[query.contact.interactionId]) throw new SceneFault('INVALID_CONTACT', '不存在的家具交互权限')
    }
    return world.props.every(prop => {
      const t = this.templates.template(prop.templateId), local = { x: p.x - prop.position.x, y: p.y - prop.position.y }
      if (!furnitureCells(t).some(c => sameCell(c, local))) return true
      return query.contact?.propId === prop.id && Boolean(t.interactions?.[query.contact.interactionId]?.cells.some(c => sameCell(c, local)))
    })
  }

  segmentClear(world: World, from: Point, to: Point, query: NavigationQuery = {}) {
    if (!isCell(from) || !isCell(to) || from.x !== to.x && from.y !== to.y) return false
    const dx = Math.sign(to.x - from.x), dy = Math.sign(to.y - from.y)
    let p = { ...from }
    if (!this.walkable(world, p, query)) return false
    while (!sameCell(p, to)) { p = { x: p.x + dx, y: p.y + dy }; if (!this.walkable(world, p, query)) return false }
    return true
  }

  path(world: World, from: Point, to: Point, query: NavigationQuery = {}): Point[] {
    if (query.contact && !world.props.some(p => p.id === query.contact!.propId && this.templates.template(p.templateId).interactions?.[query.contact!.interactionId])) throw new SceneFault('INVALID_CONTACT', '不存在的家具交互权限')
    const grid = new PF.Grid(world.width, world.height)
    const blocked = new Set(query.obstacles?.map(o => cellKey(o.position)))
    for (const prop of world.props) {
      const t = this.templates.template(prop.templateId)
      const allowed = query.contact?.propId === prop.id ? t.interactions?.[query.contact.interactionId] : undefined
      if (query.contact?.propId === prop.id && !allowed) throw new SceneFault('INVALID_CONTACT', '不存在的家具交互权限')
      for (const cell of furnitureCells(t)) if (!allowed?.cells.some(p => sameCell(p, cell))) blocked.add(cellKey(addCell(prop.position, cell)))
    }
    for (const area of world.blockedAreas ?? []) for (let y = area.bounds.top; y < area.bounds.bottom; y++) for (let x = area.bounds.left; x < area.bounds.right; x++) blocked.add(cellKey({ x, y }))
    const inside = world.walkableArea && convexAreaContains(world.walkableArea)
    const within = query.within && new Set(query.within.map(cellKey))
    const b = world.bounds
    for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) {
      const floor = x >= b.left && x < b.right && y >= b.top && y < b.bottom && (!inside || [0, 1].every(dx => [0, 1].every(dy => inside({ x: x + dx, y: y + dy }))))
      const key = cellKey({ x, y })
      grid.setWalkableAt(x, y, floor && !blocked.has(key) && (!within || within.has(key)))
    }
    const walkable = (p: Point) => isCell(p) && grid.isInside(p.x, p.y) && grid.isWalkableAt(p.x, p.y)
    if (!walkable(from) || !walkable(to)) throw new SceneFault('NO_ROUTE', '起点或目标格不可通行')
    if (sameCell(from, to)) return []
    const found = new PF.AStarFinder({ diagonalMovement: PF.DiagonalMovement.Never }).findPath(from.x, from.y, to.x, to.y, grid)
    if (!found.length) throw new SceneFault('NO_ROUTE', '没有可达的整数格路径')
    const clear = (a: Point, b: Point) => {
      if (a.x !== b.x && a.y !== b.y) return false
      let p = a
      while (walkable(p)) {
        if (sameCell(p, b)) return true
        p = { x: p.x + Math.sign(b.x - p.x), y: p.y + Math.sign(b.y - p.y) }
      }
      return false
    }
    const candidates = [shortenPath(found.map(([x, y]) => ({ x, y })), clear), ...elbowPaths(from, to, clear)]
    for (let x = world.bounds.left; x < world.bounds.right; x++) {
      const route = compactPath([from, { x, y: from.y }, { x, y: to.y }, to])
      if (route.slice(1).every((p, i) => clear(route[i], p))) candidates.push(route)
    }
    for (let y = world.bounds.top; y < world.bounds.bottom; y++) {
      const route = compactPath([from, { x: from.x, y }, { x: to.x, y }, to])
      if (route.slice(1).every((p, i) => clear(route[i], p))) candidates.push(route)
    }
    candidates.sort(comparePaths)
    const route: Point[] = [], vertices = candidates[0]
    for (let i = 1; i < vertices.length; i++) {
      let p = vertices[i - 1]
      while (!sameCell(p, vertices[i])) {
        p = { x: p.x + Math.sign(vertices[i].x - p.x), y: p.y + Math.sign(vertices[i].y - p.y) }; route.push(p)
      }
    }
    return route
  }

  validate(world: World, options: { connectivity?: boolean } = {}) {
    if (world.unit !== 'cell' || world.gridSize !== 1 || !Number.isInteger(world.width) || !Number.isInteger(world.height)) throw new SceneFault('INVALID_CELL', '地图只接受整数格单位')
    if (world.walkableArea) convexAreaContains(world.walkableArea)
    validateFurnitureFootprints(world, id => this.templates.template(id))
    const ids = [...world.actors, ...world.props, ...world.blockedAreas ?? []].map(e => e.id)
    if (new Set(ids).size !== ids.length) throw new SceneFault('DUPLICATE_ENTITY', '对象 ID 重复')
    for (const prop of world.props) {
      const t = this.templates.template(prop.templateId)
      if (furnitureCells(t).some(c => !this.onFloor(world, addCell(prop.position, c)))) throw new SceneFault('OUT_OF_BOUNDS', `「${prop.name}」占用了房间外的格子`)
    }
    for (const area of world.blockedAreas ?? []) {
      const b = area.bounds
      if (!Object.values(b).every(Number.isInteger) || b.left >= b.right || b.top >= b.bottom || b.left < world.bounds.left || b.right > world.bounds.right || b.top < world.bounds.top || b.bottom > world.bounds.bottom) throw new SceneFault('OUT_OF_BOUNDS', '阻挡格范围无效')
    }
    if (options.connectivity === false) return
    const destinations: Point[][] = []
    for (const prop of world.props) {
      const t = this.templates.template(prop.templateId)
      for (const [id, interaction] of Object.entries(t.interactions ?? {})) {
        const target = this.anchor(world, prop.id, interaction.anchor)
        const entrances = interaction.approaches.map(key => this.anchor(world, prop.id, key)).filter(p => {
          if (!this.walkable(world, p)) return false
          const within = [p, target, ...interaction.cells.map(c => addCell(prop.position, c))]
          try { this.path(world, p, target, { contact: { propId: prop.id, interactionId: id }, within }); return true } catch { return false }
        })
        if (!entrances.length) throw new SceneFault('SEAT_BLOCKED', `「${prop.name}」的${interaction.name}没有可达入口`)
        destinations.push(entrances)
      }
      for (const key of Object.keys(t.anchors)) {
        if (t.optionalAnchors?.includes(key) || Object.values(t.interactions ?? {}).some(i => i.anchor === key)) continue
        destinations.push([this.anchor(world, prop.id, key)])
      }
    }
    if (destinations.length && !destinations[0].some(from => destinations.every(group => group.some(to => {
      try { this.path(world, from, to); return true } catch { return false }
    })))) throw new SceneFault('NO_ROUTE', '家具入口与必需互动格之间没有连通的通道')
    const occupied = new Set<string>(), homes = new Set<string>()
    for (const actor of world.actors) {
      if (!isCell(actor.position)) throw new SceneFault('INVALID_CELL', '人物位置必须是整数格')
      if (occupied.has(cellKey(actor.position))) throw new SceneFault('ACTOR_OVERLAP', '两个人物不能占据同一格')
      occupied.add(cellKey(actor.position))
      if (actor.homeId) {
        if (homes.has(actor.homeId)) throw new SceneFault('BINDING_CONFLICT', '座位不能重复绑定')
        homes.add(actor.homeId); this.anchor(world, actor.homeId, 'seat')
      } else if (!this.walkable(world, actor.position)) throw new SceneFault('NO_ROUTE', `人物 ${actor.id} 没有可用起点格`)
    }
  }
}
