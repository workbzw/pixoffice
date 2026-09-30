import { z } from 'zod'
import type { Actor, ActivityPlan, Phase, World } from '../model'
import type { PluginContext, ScenePlugin } from '../plugins'
import { SceneFault, idSchema } from '../protocol'
import { scenePrimitives } from './primitives'
import { OFFICE_WALKABLE_AREA } from './officeFloor'

const people = [
  ['marvis', '王明', 0xe85d4a],
  ['code-agent', '李研', 0x4a90d9],
  ['file-agent', '周理', 0x9b6dd7],
  ['app-agent', '陈书', 0xf5c542],
  ['review-agent', '刘市', 0xf97316],
  ['data-agent', '赵审', 0x4ecdc4],
] as const

export const officeObjects: ScenePlugin = {
  id: 'office.objects', name: '办公室场景与物品', version: '1.0.0', apiVersion: 1,
  templates: [
    { id: 'office.workstation', name: '办公桌椅', view: 'workstation',
      footprint: { left: 0, right: 2, top: 0, bottom: 2 },
      interactions: { seat: { name: '入座工作', anchor: 'seat', approaches: ['seatLeft', 'seatRight'], cells: [{ x: 0, y: 1 }, { x: 1, y: 1 }], facing: 'back', posture: 'seated', requiresHome: true } },
      anchors: { seat: { x: 0, y: 1 }, seatStand: { x: 0, y: 1 }, seatEntry: { x: -1, y: 1 }, seatLeft: { x: -1, y: 1 }, seatRight: { x: 2, y: 1 }, visitor: { x: -1, y: 1 }, visitorRight: { x: 2, y: 1 }, visitorFront: { x: 0, y: 2 }, conversationLeft: { x: -1, y: 1 }, conversationRight: { x: 2, y: 1 } },
      optionalAnchors: ['seatStand', 'seatEntry', 'seatLeft', 'seatRight', 'visitor', 'visitorRight', 'visitorFront', 'conversationLeft', 'conversationRight'], resources: { visitor: 1, seat: 1 } },
    { id: 'office.whiteboard', name: '会议白板', view: 'whiteboard',
      footprint: { left: 0, right: 2, top: 0, bottom: 1 },
      interactions: { write: { name: '查看白板', anchor: 'attendee1', approaches: ['attendee1'], cells: [], posture: 'standing', facing: 'back', resource: 'meeting' } },
      anchors: { attendee1: { x: 0, y: 1 }, attendee2: { x: 1, y: 1 }, attendee3: { x: 0, y: 2 }, attendee4: { x: 1, y: 2 } }, resources: { meeting: 1 } },
  ],
  stateSchemas: { 'office.whiteboard': z.strictObject({ title: z.string().max(60), text: z.string().max(500) }) },
}

export function createOfficeWorld(sceneId = 'office-1'): World {
  const props = people.map((_, i) => ({ id: `desk-${i}`, name: `${people[i][1]}的工位`, templateId: 'office.workstation', position: { x: 6 + i % 2 * 5, y: 4 + Math.floor(i / 2) * 3 }, state: {}, stateRevision: 0 }))
  const actors: Actor[] = people.map(([id, name, color], i) => ({ id, name, templateId: id, color, homeId: props[i].id,
    position: { x: props[i].position.x, y: props[i].position.y + 1 }, facing: 'back', posture: 'seated', using: { propId: props[i].id, interactionId: 'seat' },
    presentation: { status: 'idle', title: '等待指令', sourceRevision: 0 } }))
  return { sceneId, unit: 'cell', width: 20, height: 13, gridSize: 1, layoutRevision: 0,
    bounds: { left: 4, top: 4, right: 16, bottom: 12 }, walkableArea: OFFICE_WALKABLE_AREA.map(point => ({ ...point })), actors,
    props: [...props, { id: 'whiteboard-1', name: '协作白板', templateId: 'office.whiteboard', position: { x: 4, y: 7 }, state: { title: '团队协作', text: '等待议题' }, stateRevision: 0 }] }
}

function actors(context: PluginContext, role?: string) {
  const selected = role ? context.participants.filter(p => p.role === role) : context.participants
  return selected.map(p => {
    const actor = context.world.actors.find(a => a.id === p.entityId)
    if (!actor) throw new SceneFault('ENTITY_NOT_FOUND', p.entityId)
    return actor
  })
}
function one(context: PluginContext, role: string) {
  const list = actors(context, role)
  if (list.length !== 1) throw new SceneFault('INVALID_PARTICIPANTS', `需要一位 ${role}`)
  return list[0]
}
const claim = (resource: string) => ({ resource, units: 1 })
const bodies = (list: Actor[]) => list.map(a => claim(`actor:${a.id}:body`))
const speeches = (list: Actor[]) => list.map(a => claim(`actor:${a.id}:speech`))
function homeId(actor: Actor) { if (!actor.homeId) throw new SceneFault('MISSING_BINDING', `${actor.name} 没有绑定座位`); return actor.homeId }
const returnHome = (list: Actor[]): Phase[] => [
  { title: '返回工位', moves: list.map(a => ({ actorId: a.id, targetId: homeId(a), anchor: 'seat' })) },
  { title: '入座', poses: list.map(a => ({ actorId: a.id, posture: 'seated', facing: 'back' })) },
]

const visitParams = z.strictObject({ stops: z.array(z.strictObject({ hostId: idSchema, message: z.string().max(500), reply: z.string().min(1).max(500).optional() })).min(1).max(10), durationMs: z.number().int().min(300).max(30000).default(3000) })
export const officeVisits: ScenePlugin = {
  id: 'office.visits', name: '工位拜访与交接', version: '1.0.0', apiVersion: 1, dependencies: ['office.objects'],
  capabilities: [{ id: 'office.visit', name: '拜访工位', params: visitParams,
    build(context, raw): ActivityPlan {
      const params = visitParams.parse(raw), visitor = one(context, 'visitor')
      if (context.participants.some(p => p.role !== 'visitor' && p.role !== 'host')) throw new SceneFault('INVALID_PARTICIPANTS', '拜访仅支持 visitor 和 host 角色')
      const hosts = params.stops.map(s => context.world.actors.find(a => a.id === s.hostId))
      if (hosts.some(h => !h || h.id === visitor.id)) throw new SceneFault('INVALID_PARTICIPANTS', '拜访对象不存在或与访客相同')
      const all = [visitor, ...hosts as Actor[]].filter((a, i, array) => array.findIndex(b => b.id === a.id) === i)
      if (context.participants.length !== all.length || all.some(a => !context.participants.some(p => p.entityId === a.id))) throw new SceneFault('INVALID_PARTICIPANTS', '参与者须包含访客和所有接待人')
      const phases: Phase[] = []
      params.stops.forEach((stop, i) => {
        const host = hosts[i]!
        const poses: Phase['poses'] = [{ actorId: visitor.id, posture: 'standing', lookAt: host.id }, { actorId: host.id, posture: 'seated', lookAt: visitor.id }]
        phases.push({ title: `${host.name}准备接待`, moves: [{ actorId: host.id, targetId: homeId(host), anchor: 'seat' }] },
          { title: `前往${host.name}的工位`, moves: [{ actorId: visitor.id, targetId: homeId(host), anchor: 'conversationLeft', alternatives: ['conversationRight', 'visitorFront'] }], poses },
          { title: `与${host.name}交接`, durationMs: params.durationMs,
            poses,
            speech: [{ actorId: visitor.id, text: stop.message }] },
          { title: `${host.name}回应`, durationMs: Math.max(800, Math.min(params.durationMs, 2000)),
            poses: [{ actorId: visitor.id, lookAt: host.id }, { actorId: host.id, lookAt: visitor.id }],
            speech: [{ actorId: host.id, text: stop.reply ?? `${visitor.name}，收到。` }] },
          { title: '交接结束', poses: [{ actorId: host.id, posture: 'seated', facing: 'back' }] })
      })
      return { title: `${visitor.name} · 工位交接`, claims: [...bodies(all), ...speeches(all), ...[...new Set(hosts.map(h => homeId(h!)))].map(id => claim(`prop:${id}:visitor`))], phases: [...phases, ...returnHome([visitor])] }
    } }],
}

const meetingParams = z.strictObject({ boardId: idSchema, text: z.string().max(500), durationMs: z.number().int().min(1000).max(120000).default(8000) })
export const officeMeetings: ScenePlugin = {
  id: 'office.meetings', name: '多人会议', version: '1.0.0', apiVersion: 1, dependencies: ['office.objects'],
  capabilities: [{ id: 'office.meeting', name: '白板会议', params: meetingParams,
    build(context, raw) {
      const params = meetingParams.parse(raw), list = actors(context)
      if (list.length < 2 || list.length > 4 || context.participants.filter(p => p.role === 'speaker').length !== 1 || context.participants.some(p => p.role !== 'speaker' && p.role !== 'attendee')) throw new SceneFault('INVALID_PARTICIPANTS', '会议需 2–4 人、一位 speaker，其余为 attendee')
      const board = context.world.props.find(p => p.id === params.boardId && p.templateId === 'office.whiteboard')
      if (!board) throw new SceneFault('ENTITY_NOT_FOUND', params.boardId)
      const speaker = one(context, 'speaker')
      return { title: '团队会议', claims: [...bodies(list), ...speeches(list), claim(`prop:${board.id}:meeting`)], phases: [
        // Fill the back row before the front row, then leave in reverse order.
        ...list.map((a, i) => ({ title: `${a.name}到场`, moves: [{ actorId: a.id, targetId: board.id, anchor: `attendee${i + 1}` }] })),
        { title: '讨论', durationMs: params.durationMs, poses: list.map(a => ({ actorId: a.id, posture: 'standing', facing: 'back' })), speech: [{ actorId: speaker.id, text: params.text }] },
        ...[...list].reverse().flatMap(a => returnHome([a])),
      ] }
    } }],
}

const focusParams = z.strictObject({ title: z.string().min(1).max(100) })
const emoteParams = z.strictObject({ animation: z.enum(['emotes/wave', 'emotes/thinking', 'emotes/surprised']), durationMs: z.number().int().min(300).max(30000).default(4000) })
export const officePersonal: ScenePlugin = {
  id: 'office.personal', name: '个人活动与表情', version: '1.0.0', apiVersion: 1, dependencies: ['office.objects'],
  capabilities: [
    { id: 'office.focus', name: '持续专注', params: focusParams, build(context, raw) {
      if (context.participants.length !== 1) throw new SceneFault('INVALID_PARTICIPANTS', '个人活动只允许一位参与者')
      const a = one(context, 'worker'), p = focusParams.parse(raw)
      return { title: p.title, claims: bodies([a]), continuous: true, maxDurationMs: 3600000,
        phases: [...returnHome([a]), { title: p.title }] }
    } },
    { id: 'office.emote', name: '表情', params: emoteParams, build(context, raw) {
      if (context.participants.length !== 1) throw new SceneFault('INVALID_PARTICIPANTS', '个人活动只允许一位参与者')
      const a = one(context, 'actor'), p = emoteParams.parse(raw)
      return { title: '表情', claims: bodies([a]), phases: [{ title: '表情', durationMs: p.durationMs,
        poses: [{ actorId: a.id, posture: 'standing', facing: 'front', expression: p.animation }] }, ...(a.posture === 'seated' ? returnHome([a]) : [])] }
    } },
  ],
}

const useParams = z.strictObject({ objectId: idSchema, interactionId: idSchema, durationMs: z.number().int().min(300).max(120000).default(4000) })
export const furnitureUse: ScenePlugin = {
  id: 'scene.furniture', name: '家具使用', version: '1.0.0', apiVersion: 1, dependencies: ['office.objects'],
  capabilities: [{ id: 'furniture.use', name: '使用家具', params: useParams, build(context, raw) {
    const p = useParams.parse(raw), actor = one(context, 'user')
    if (context.participants.length !== 1) throw new SceneFault('INVALID_PARTICIPANTS', '每次家具使用需要一位 user')
    const prop = context.world.props.find(item => item.id === p.objectId)
    const config = prop && context.template(prop.templateId).interactions?.[p.interactionId]
    if (!prop || !config) throw new SceneFault('INTERACTION_NOT_SUPPORTED', '家具没有这项交互')
    if (config.requiresHome && actor.homeId !== prop.id) throw new SceneFault('SEAT_NOT_OWNED', '只能使用本人绑定的座位')
    return { title: `${actor.name} · ${config.name}`, claims: [...bodies([actor]), claim(`prop:${prop.id}:${config.resource ?? p.interactionId}`)], phases: [
      { title: `前往${prop.name}`, moves: [{ actorId: actor.id, targetId: prop.id, anchor: config.anchor, interactionId: p.interactionId }] },
      { title: config.name, durationMs: p.durationMs, poses: [{ actorId: actor.id, facing: config.facing }] },
      ...(actor.homeId ? returnHome([actor]) : [{ title: '离开家具', moves: [{ actorId: actor.id, targetId: prop.id, anchor: config.approaches[0], alternatives: config.approaches.slice(1) }] }]),
    ] }
  } }],
}
export const builtinPlugins = [scenePrimitives, officeObjects, officeVisits, officeMeetings, officePersonal, furnitureUse]
