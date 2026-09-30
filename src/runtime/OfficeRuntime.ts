import { z } from 'zod'
import { batchSchema, canonical, commandSchema, idSchema, pointSchema, protocolDescription, SceneFault, sceneError, terminal } from './protocol'
import type { CommandRecord, CommandResult, SceneCommand, StartCommand } from './protocol'
import type { Activity, ActivityPlan, Actor, Checkpoint, Persistence, SceneEvent, Snapshot, World } from './model'
import { resolvePoses, unrestrictedPoses } from './actionContract'
import type { PoseSupport } from './actionContract'
import type { NavigationAdapter, NavigationFactory } from './navigationAdapter'
import { PluginHost } from './plugins'
import type { ScenePlugin } from './plugins'
import { ResourceManager } from './resources'
import { MovementController } from './movement'
import type { SeatStepDuration } from './seatInteraction'
import { convexAreaContains } from './walkableArea'
import { blockedAreaSchema } from './schema'
import { MapDraft, exportMap } from './map/MapDraft'
import type { MapEdit } from './map/schema'
import { FURNITURE_CELL_SIZE, validateFurnitureFootprints } from './map/furnitureGrid'
import { migrateLegacyWorld } from './map/migrateLegacy'

// Old geometry commands are audit records only; restore marks unfinished work failed.
const archivedCommand = z.looseObject({ protocolVersion: z.literal('1.0'), sceneId: idSchema, commandId: idSchema,
  type: z.enum(['map.edit', 'layout.apply', 'activity.start', 'activity.stop', 'command.cancel', 'actor.presentation.set', 'object.state.set']) })
const savedCommand = z.custom<SceneCommand>(value => commandSchema.safeParse(value).success || archivedCommand.safeParse(value).success)

const actorSchema = z.object({ id: idSchema, name: z.string().max(100), templateId: idSchema, color: z.number().int(), position: pointSchema, homeId: idSchema.optional(),
  facing: z.enum(['front', 'back', 'left', 'right']), posture: z.enum(['standing', 'seated']),
  using: z.strictObject({ propId: idSchema, interactionId: idSchema }).optional(),
  presentation: z.strictObject({ status: z.enum(['idle', 'working', 'thinking']), title: z.string().max(200), sourceRevision: z.number().int().nonnegative() }) })
const worldSchema = z.strictObject({ sceneId: idSchema, unit: z.literal('cell'), width: z.number().int().min(1).max(128), height: z.number().int().min(1).max(128),
  gridSize: z.literal(1), layoutRevision: z.number().int().nonnegative(),
  bounds: z.strictObject({ left: z.number().int(), top: z.number().int(), right: z.number().int(), bottom: z.number().int() }),
  walkableArea: z.array(pointSchema).min(3).max(16).refine(points => {
    try { convexAreaContains(points); return true } catch { return false }
  }, '可行走区域必须是无交叉的凸多边形').optional(),
  blockedAreas: z.array(blockedAreaSchema).max(64).optional(),
  actors: z.array(actorSchema).max(100), props: z.array(z.strictObject({ id: idSchema, name: z.string().max(100), templateId: idSchema, position: pointSchema, anchors: z.record(idSchema, pointSchema).optional(), state: z.record(z.string(), z.json()), stateRevision: z.number().int().nonnegative() })).max(200) })
const planSchema = z.strictObject({ title: z.string().max(200), claims: z.array(z.strictObject({ resource: z.string().max(200), units: z.number().int().positive() })).max(100),
  continuous: z.boolean().optional(), maxDurationMs: z.number().int().min(100).max(3600000).optional(),
  phases: z.array(z.strictObject({ title: z.string().max(200), durationMs: z.number().int().nonnegative().max(120000).optional(),
    moves: z.array(z.strictObject({ actorId: idSchema, targetId: idSchema, anchor: idSchema, interactionId: idSchema.optional(), alternatives: z.array(idSchema).max(8).optional(),
      })).max(24).optional(),
    speech: z.array(z.strictObject({ actorId: idSchema, text: z.string().max(500) })).max(24).optional(),
    poses: z.array(z.strictObject({ actorId: idSchema, posture: z.enum(['standing', 'seated']).optional(), facing: z.enum(['front', 'back', 'left', 'right']).optional(), lookAt: idSchema.optional(), expression: z.string().max(80).optional() })).max(24).optional(),
  })).min(1).max(100) })

export class OfficeRuntime {
  readonly runtimeId: string
  private readonly plugins = new PluginHost()
  readonly navigation: NavigationAdapter
  private movement: MovementController
  private supportsPose: PoseSupport
  private world: World
  private resources = new ResourceManager()
  private records = new Map<string, CommandRecord>()
  private activities = new Map<string, Activity>()
  private events: SceneEvent[] = []
  private listeners = new Set<() => void>()
  private now: () => number
  private persistence?: Persistence
  private persistenceError?: string
  private layoutRecovery?: { original: unknown; checkpoint: Checkpoint }
  private revision = 0
  private sequence = 0
  private disposed = false
  private pumping = false
  private editing = false
  private editor?: MapDraft
  private startedAt = new Map<string, number>()
  private phaseReady = new Set<string>()
  private settling = new Map<string, string[]>()

  constructor(options: { world: World; plugins: ScenePlugin[]; createNavigation: NavigationFactory; now?: () => number; persistence?: Persistence; runtimeId?: string; seatStepDuration?: SeatStepDuration; supportsPose?: PoseSupport }) {
    this.now = options.now ?? Date.now
    this.runtimeId = options.runtimeId ?? `runtime-${globalThis.crypto.randomUUID()}`
    this.world = worldSchema.parse(options.world)
    for (const plugin of options.plugins) this.plugins.register(plugin)
    this.navigation = options.createNavigation({ template: id => this.plugins.template(id) })
    this.supportsPose = options.supportsPose ?? unrestrictedPoses
    this.movement = new MovementController(this.navigation, { template: id => this.plugins.template(id) }, options.seatStepDuration, this.supportsPose)
    this.navigation.validate(this.world)
    this.persistence = options.persistence
    this.restore()
    this.defineResources()
  }

  private defineResources() {
    this.resources = new ResourceManager()
    for (const actor of this.world.actors) for (const channel of ['body', 'speech']) this.resources.define(`actor:${actor.id}:${channel}`)
    for (const prop of this.world.props) {
      const template = this.plugins.template(prop.templateId)
      for (const [key, capacity] of Object.entries(template.resources)) this.resources.define(`prop:${prop.id}:${key}`, capacity)
      for (const [id, interaction] of Object.entries(template.interactions ?? {})) {
        const key = interaction.resource ?? id
        if (!template.resources[key]) this.resources.define(`prop:${prop.id}:${key}`)
      }
      for (const key of Object.keys(template.anchors)) this.resources.define(`anchor:${prop.id}:${key}`)
    }
  }

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  getRevision = () => this.revision
  get sceneId() { return this.world.sceneId }
  get isEditing() { return this.editing }
  template(id: string) { return this.plugins.template(id) }
  templates() { return this.plugins.templates() }
  exportMap() { return exportMap(this.world) }
  editorSnapshot() { return this.editor?.snapshot() }
  readEditorWorld() { return this.editor?.world(this.world) ?? this.readWorld() }
  readWorld(): World { return structuredClone(this.world) }
  readActors(): Actor[] { return structuredClone(this.world.actors) }
  readActivePhases() {
    return [...this.activities.values()].filter(activity => activity.status === 'active').map(activity => ({
      activityId: activity.id, capability: activity.capability, participants: [...activity.participants],
      phaseIndex: activity.phaseIndex, phaseCount: activity.plan.phases.length,
      title: activity.plan.phases[activity.phaseIndex]?.title ?? activity.plan.title,
      ready: this.phaseReady.has(activity.id),
    }))
  }
  getRecord(id: string) { const record = this.records.get(id); return record ? structuredClone(record) : undefined }
  snapshot(): Snapshot { return structuredClone({ world: this.world, activities: [...this.activities.values()], records: [...this.records.values()], events: this.events,
    resources: this.resources.snapshot(), plugins: this.plugins.list(), editing: this.editing, editor: this.editor?.snapshot(), persistenceError: this.persistenceError,
    canRecoverLayout: Boolean(this.layoutRecovery && this.persistence?.replaceWithBackup) }) }
  describe() { return { ...protocolDescription(), sceneId: this.sceneId, furnitureGrid: { cellSize: FURNITURE_CELL_SIZE, origin: { x: 0, y: 0 } }, plugins: this.plugins.describe(), templates: this.templates(), entities: [...this.world.actors.map(a => ({ id: a.id, name: a.name, kind: 'actor' })), ...this.world.props.map(p => ({ id: p.id, name: p.name, kind: 'prop', templateId: p.templateId, anchors: { ...this.plugins.template(p.templateId).anchors, ...p.anchors } }))] } }

  submit(value: unknown): CommandResult {
    const parsed = commandSchema.safeParse(value)
    if (!parsed.success) return { commandId: typeof value === 'object' && value && 'commandId' in value ? String(value.commandId).slice(0, 100) : '', status: 'rejected', error: { code: 'INVALID_COMMAND', message: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ').slice(0, 500) } }
    const command = parsed.data
    const previous = this.records.get(command.commandId)
    if (previous) return canonical(previous.command) === canonical(command) ? this.result(previous) : { commandId: command.commandId, status: 'rejected', error: { code: 'COMMAND_ID_CONFLICT', message: '同一个命令 ID 不能对应不同内容' } }
    if (this.disposed || this.persistenceError) return { commandId: command.commandId, status: 'rejected', error: { code: this.disposed ? 'RUNTIME_DISPOSED' : 'PERSISTENCE_FAILED', message: this.persistenceError ?? '场景已关闭' } }
    this.prune()
    if (this.records.size >= 512) return { commandId: command.commandId, status: 'rejected', error: { code: 'QUEUE_FULL', message: '命令记录已满' } }
    const record: CommandRecord = { command, status: 'queued', acceptedAt: this.now() }
    this.records.set(command.commandId, record)
    try {
      if (command.sceneId !== this.sceneId) throw new SceneFault('SCENE_MISMATCH', command.sceneId)
      if ([...this.records.values()].filter(r => !terminal(r.status)).length > 128) throw new SceneFault('QUEUE_FULL', '等待队列已满')
      if (command.after?.some(id => id === command.commandId || !this.records.has(id))) throw new SceneFault('INVALID_DEPENDENCY', '依赖须引用先前已接受的命令')
      if (this.editing && !['map.edit', 'layout.apply', 'actor.presentation.set', 'object.state.set', 'command.cancel', 'activity.stop'].includes(command.type)) throw new SceneFault('EDITING', '布局编辑期间不接受新活动')
      if (command.type === 'activity.start') this.buildPlan(command)
      this.persist()
      if (this.persistenceError) throw new SceneFault('PERSISTENCE_FAILED', this.persistenceError)
      this.emit('command.status', { commandId: command.commandId, status: 'queued' })
      this.pump()
    } catch (error) { this.finish(record, 'rejected', sceneError(error)) }
    return this.result(record)
  }

  submitBatch(value: unknown): CommandResult[] {
    const batch = batchSchema.parse(value)
    const ids = batch.commands.map(c => c.commandId)
    if (new Set(ids).size !== ids.length) throw new SceneFault('DUPLICATE_COMMAND', '批次中的命令 ID 必须唯一')
    return batch.commands.map((command, i) => this.submit(batch.mode === 'sequence' && i > 0 ? { ...command, after: [...new Set([...(command.after ?? []), ids[i - 1]])] } : command))
  }

  tick(dtMs: number) {
    if (this.disposed || this.editing) return
    const dt = Math.max(0, Math.min(Number.isFinite(dtMs) ? dtMs : 0, 100))
    for (const actor of this.world.actors) {
      if (actor.speech) { actor.speech.remainingMs -= dt; if (actor.speech.remainingMs <= 0) actor.speech = undefined }
    }
    for (const [activityId, ids] of this.settling) {
      for (const id of ids) {
        const actor = this.actor(id)
        if (actor.seatTransition) this.movement.seats.advance(this.world, actor, dt, true)
        else this.movement.advance(this.world, actor, dt)
        this.movement.releaseUse(this.world, actor)
      }
      if (ids.every(id => !this.movement.busy(this.actor(id)) && !this.movement.needsRelease(this.actor(id)))) {
        this.settling.delete(activityId); this.resources.release(activityId); this.persist()
        this.emit('activity.settled', { activityId })
      }
    }
    for (const activity of this.activities.values()) {
      if (activity.status !== 'active') continue
      try {
        const record = this.records.get(activity.commandId)!
        const max = activity.plan.continuous ? activity.plan.maxDurationMs ?? 3600000 : record.command.timeoutMs ?? 120000
        if (this.now() - this.startedAt.get(activity.id)! >= max) throw new SceneFault('EXECUTION_TIMEOUT', '活动超过执行期限')
        this.advance(activity, dt)
      } catch (error) { this.endActivity(activity, 'failed', sceneError(error)) }
    }
    this.pump()
  }

  private buildPlan(command: StartCommand) {
    if (new Set(command.participants.map(p => p.entityId)).size !== command.participants.length) throw new SceneFault('INVALID_PARTICIPANTS', '参与者不能重复')
    for (const participant of command.participants) this.actor(participant.entityId)
    const { capability, pluginId } = this.plugins.capability(command.capability)
    const checked = capability.params.safeParse(command.params)
    if (!checked.success) throw new SceneFault('INVALID_PARAMS', checked.error.issues.map(i => i.message).join('; '))
    const params = checked.data
    const plan: ActivityPlan = planSchema.parse(capability.build({ world: this.readWorld(), participants: structuredClone(command.participants), template: id => this.template(id) }, params))
    const participants = new Set(command.participants.map(p => p.entityId))
    const claimed = (id: string, channel: string) => plan.claims.some(c => c.resource === `actor:${id}:${channel}`)
    for (const id of participants) {
      const homeId = this.actor(id).homeId
      if (homeId && claimed(id, 'body') && this.movement.seats.config(this.world, homeId)) {
        const resource = `prop:${homeId}:seat`
        if (!plan.claims.some(c => c.resource === resource)) plan.claims.push({ resource, units: 1 })
      }
    }
    for (const phase of plan.phases) {
      for (const move of phase.moves ?? []) {
        if (move.interactionId) {
          const interaction = this.movement.seats.config(this.world, move.targetId, move.interactionId)
          if (!interaction || interaction.anchor !== move.anchor) throw new SceneFault('INVALID_PLAN', '家具交互与使用格不匹配')
          const resource = `prop:${move.targetId}:${interaction.resource ?? move.interactionId}`
          if (!plan.claims.some(c => c.resource === resource)) plan.claims.push({ resource, units: 1 })
        }
        for (const anchor of new Set([move.anchor, ...move.alternatives ?? []])) {
          this.navigation.anchor(this.world, move.targetId, anchor)
          const resource = `anchor:${move.targetId}:${anchor}`
          if (!plan.claims.some(c => c.resource === resource)) plan.claims.push({ resource, units: 1 })
        }
      }
      for (const pose of phase.poses ?? []) if (pose.lookAt) {
        this.actor(pose.lookAt)
        if (pose.facing) throw new SceneFault('INVALID_PLAN', '朝向与面向对象不能同时指定')
      }
      for (const effect of [...(phase.moves ?? []), ...(phase.poses ?? [])]) if (!participants.has(effect.actorId) || !claimed(effect.actorId, 'body')) throw new SceneFault('INVALID_PLAN', '动作缺少参与者或身体资源声明')
      for (const speech of phase.speech ?? []) if (!participants.has(speech.actorId) || !claimed(speech.actorId, 'speech')) throw new SceneFault('INVALID_PLAN', '说话缺少参与者或语音资源声明')
      if (new Set(phase.moves?.map(m => m.actorId)).size !== (phase.moves?.length ?? 0)) throw new SceneFault('INVALID_PLAN', '同阶段不能移动一个人两次')
      if (new Set(phase.poses?.map(p => p.actorId)).size !== (phase.poses?.length ?? 0)) throw new SceneFault('INVALID_PLAN', '同阶段不能为一个人指定两种姿态')
    }
    if (plan.claims.length > 128) throw new SceneFault('INVALID_PLAN', '活动占用的资源数量过多')
    this.resources.validate(plan.claims)
    return { plan, pluginId }
  }

  private pump() {
    if (this.pumping || this.disposed) return
    this.pumping = true
    const blockedResources = new Set<string>()
    try {
      for (const record of this.records.values()) {
        if (record.status !== 'queued') continue
        const command = record.command
        try {
          if (this.now() > (command.expiresAt ? Date.parse(command.expiresAt) : record.acceptedAt + 120000)) { this.finish(record, 'expired'); continue }
          const dependencies = command.after?.map(id => this.records.get(id)) ?? []
          if (dependencies.some(r => !r || terminal(r.status) && r.status !== 'completed')) throw new SceneFault('DEPENDENCY_FAILED', '前置命令失败，后续命令不会执行')
          if (dependencies.some(r => r?.status !== 'completed')) continue
          if (command.type === 'activity.start') {
            const { plan, pluginId } = this.buildPlan(command)
            if (plan.claims.some(c => blockedResources.has(c.resource)) || !this.resources.available(plan.claims)) {
              if (command.busyPolicy === 'reject') throw new SceneFault('BUSY', '参与者或资源正在使用中')
              plan.claims.forEach(c => blockedResources.add(c.resource)); continue
            }
            const activity: Activity = { id: command.commandId, commandId: command.commandId, pluginId, capability: command.capability,
              participants: command.participants.map(p => p.entityId), plan, phaseIndex: 0, phaseStarted: false, elapsedMs: 0, phaseElapsedMs: 0, status: 'active' }
            this.resources.acquire(activity.id, plan.claims)
            this.activities.set(activity.id, activity)
            this.startedAt.set(activity.id, this.now())
            record.activityId = activity.id; record.status = 'running'
            this.persist()
            if (this.persistenceError) throw new SceneFault('PERSISTENCE_FAILED', this.persistenceError)
            this.emit('command.status', { commandId: command.commandId, activityId: activity.id, status: 'running' })
            this.advance(activity, 0)
            if (plan.continuous && activity.status === 'active') this.finish(record, 'completed')
            else this.persist()
          } else this.executeImmediate(record)
        } catch (error) {
          const activity = this.activities.get(command.commandId)
          if (activity?.status === 'active') this.endActivity(activity, 'failed', sceneError(error))
          else this.finish(record, 'failed', sceneError(error))
        }
      }
    } finally { this.pumping = false }
  }

  private advance(activity: Activity, dt: number) {
    const phase = activity.plan.phases[activity.phaseIndex]
    if (!phase) { this.endActivity(activity, 'completed'); return }
    if (!activity.phaseStarted) {
      const movingIds = new Set(phase.moves?.map(move => move.actorId))
      const destinations: { x: number; y: number }[] = []
      const paths = (phase.moves ?? []).map(move => this.movement.resolve(this.world, move, movingIds, destinations, phase.poses))
      for (const pose of phase.poses ?? []) {
        const actor = this.actor(pose.actorId)
        if (pose.posture === 'standing' && actor.posture === 'seated' && !movingIds.has(actor.id)) paths.push(this.movement.stand(this.world, actor, destinations, pose.lookAt ? this.actor(pose.lookAt).position : undefined))
      }
      resolvePoses(this.world, phase.poses ?? [], this.supportsPose, new Map(paths.map(path => [path.actor.id, path.destination])))
      for (const path of paths) this.movement.start(path)
      this.phaseReady.delete(activity.id)
      activity.phaseStarted = true; activity.phaseElapsedMs = 0
      this.emit('activity.phase', { activityId: activity.id, title: phase.title, participants: activity.participants })
    }
    const movingActors = activity.participants.map(id => this.actor(id)).filter(actor => activity.plan.claims.some(c => c.resource === `actor:${actor.id}:body`))
    for (const actor of movingActors) this.movement.advance(this.world, actor, dt)
    activity.elapsedMs += dt
    if (movingActors.some(actor => this.movement.busy(actor))) return
    if (!this.phaseReady.has(activity.id)) {
      // Validate the whole phase before mutating any actor or starting speech.
      const resolved = resolvePoses(this.world, phase.poses ?? [], this.supportsPose)
      for (const pose of phase.poses ?? []) {
        const actor = this.actor(pose.actorId)
        if (pose.posture === 'seated') {
          if (!actor.homeId) throw new SceneFault('MISSING_BINDING', '入座需要已绑定的座位')
          const seat = this.navigation.anchor(this.world, actor.homeId, 'seat')
          if (actor.posture !== 'seated' || actor.position.x !== seat.x || actor.position.y !== seat.y) throw new SceneFault('NOT_AT_SEAT', '请先通过座位交互完成入座')
        }
      }
      for (const pose of resolved) { pose.actor.posture = pose.posture; pose.actor.facing = pose.facing; pose.actor.expression = pose.expression }
      for (const speech of phase.speech ?? []) this.actor(speech.actorId).speech = { text: speech.text, remainingMs: phase.durationMs ?? 3000 }
      this.phaseReady.add(activity.id)
    }
    if (activity.plan.continuous && activity.phaseIndex === activity.plan.phases.length - 1) return
    activity.phaseElapsedMs += dt
    if (activity.phaseElapsedMs >= (phase.durationMs ?? 0)) { activity.phaseIndex++; activity.phaseStarted = false; if (activity.phaseIndex >= activity.plan.phases.length) this.endActivity(activity, 'completed') }
  }

  private executeImmediate(record: CommandRecord) {
    const command = record.command
    switch (command.type) {
      case 'actor.presentation.set': {
        const actor = this.actor(command.actorId)
        if (command.sourceRevision <= actor.presentation.sourceRevision) throw new SceneFault('STALE_REVISION', '展示状态版本已过期')
        actor.presentation = { status: command.status, title: command.title, sourceRevision: command.sourceRevision }
        break
      }
      case 'object.state.set': {
        const prop = this.world.props.find(p => p.id === command.entityId)
        if (!prop) throw new SceneFault('ENTITY_NOT_FOUND', command.entityId)
        if (prop.stateRevision !== command.expectedStateRevision) throw new SceneFault('REVISION_CONFLICT', '物品状态已变化')
        prop.state = this.plugins.validateState(prop.templateId, command.state); prop.stateRevision++
        break
      }
      case 'map.edit': this.editMap(command.edit, command.commandId); break
      case 'layout.apply': this.applyLayout(command); break
      case 'command.cancel': {
        const target = this.records.get(command.targetCommandId)
        if (!target || target === record) throw new SceneFault('COMMAND_NOT_FOUND', command.targetCommandId)
        if (terminal(target.status)) throw new SceneFault('ALREADY_TERMINAL', '目标命令已经结束，持续活动请使用 activity.stop')
        const activity = target.activityId ? this.activities.get(target.activityId) : undefined
        if (activity?.status === 'active') this.endActivity(activity, 'cancelled')
        else this.finish(target, 'cancelled')
        break
      }
      case 'activity.stop': {
        const activity = this.activities.get(command.activityId)
        if (!activity) throw new SceneFault('ACTIVITY_NOT_FOUND', command.activityId)
        if (activity.status === 'active') this.endActivity(activity, 'cancelled')
        break
      }
    }
    this.finish(record, 'completed')
  }

  private applyLayout(command: Extract<SceneCommand, { type: 'layout.apply' }>) {
    if (this.editor) throw new SceneFault('EDITING', '地图草稿打开期间，请通过 map.edit 修改布局')
    if (this.settling.size || [...this.activities.values()].some(a => a.status === 'active') || [...this.records.values()].some(r => r.status === 'queued' && r.command.type === 'activity.start')) throw new SceneFault('BUSY', '请先等待人物结束座位交互，再编辑布局')
    if (command.expectedLayoutRevision !== this.world.layoutRevision) throw new SceneFault('REVISION_CONFLICT', '布局已被其他操作更新')
    if (command.placements.length !== this.world.props.length || new Set(command.placements.map(p => p.entityId)).size !== this.world.props.length) throw new SceneFault('INVALID_LAYOUT', '必须提交全部物品且不能重复')
    const next = this.readWorld()
    for (const placement of command.placements) {
      const prop = next.props.find(p => p.id === placement.entityId)
      if (!prop) throw new SceneFault('ENTITY_NOT_FOUND', placement.entityId)
      prop.position = placement.position
    }
    this.navigation.validate(next)
    next.layoutRevision++
    for (const actor of next.actors) {
      if (actor.homeId) { actor.position = this.navigation.anchor(next, actor.homeId, 'seat'); actor.posture = 'seated'; actor.facing = 'back' }
      else if (!this.navigation.walkable(next, actor.position)) throw new SceneFault('ACTOR_BLOCKED', '新布局遮挡了未绑定工位的人物')
      actor.motion = undefined; actor.step = undefined; actor.using = actor.homeId ? { propId: actor.homeId, interactionId: 'seat' } : undefined; actor.expression = undefined
    }
    this.world = next
    this.emit('layout.changed', { layoutRevision: next.layoutRevision })
  }

  setEditing(editing: boolean) {
    if (editing && this.persistenceError) throw new SceneFault('PERSISTENCE_FAILED', '请先恢复存档，再编辑布局')
    if (editing && (this.settling.size || [...this.activities.values()].some(a => a.status === 'active') || [...this.records.values()].some(r => !terminal(r.status)))) throw new SceneFault('BUSY', '请先结束活动并等待座位交互完成')
    if (!editing) this.editor = undefined
    this.editing = editing; this.emit('editor.changed', { editing })
  }

  private editMap(edit: MapEdit, commandId: string) {
    if (edit.action === 'begin') {
      if (this.editing) throw new SceneFault('EDITING', '已有地图草稿，请继续编辑或取消')
      if (edit.expectedLayoutRevision !== this.world.layoutRevision) throw new SceneFault('REVISION_CONFLICT', '布局版本已变化')
      if (this.settling.size || [...this.activities.values()].some(a => a.status === 'active') || [...this.records.values()].some(r => r.command.commandId !== commandId && !terminal(r.status))) throw new SceneFault('BUSY', '请先停止演示，等待所有人物结束当前活动后编辑')
      this.editor = new MapDraft(this.world, `draft-${globalThis.crypto.randomUUID()}`, this.navigation, id => this.template(id))
      this.editing = true
    } else {
      const editor = this.editor
      if (!editor) throw new SceneFault('DRAFT_NOT_FOUND', '请先创建地图草稿')
      editor.assertRevision(edit.draftId, edit.expectedDraftRevision)
      switch (edit.action) {
        case 'patch': editor.patch(edit.operations, this.world, edit.requireValid); break
        case 'undo': editor.undo(this.world); break
        case 'redo': editor.redo(this.world); break
        case 'validate': editor.validate(this.world); break
        case 'route': editor.previewRoute(this.world, edit.from, edit.to); break
        case 'cancel': this.editor = undefined; this.editing = false; break
        case 'commit': {
          if (editor.baseLayoutRevision !== this.world.layoutRevision) throw new SceneFault('REVISION_CONFLICT', '正式地图已变化，请重新创建草稿')
          const next = worldSchema.parse(editor.world(this.world))
          validateFurnitureFootprints(next, id => this.template(id))
          this.navigation.validate(next)
          next.layoutRevision++
          // Persist a successful commit before replacing the live map.
          const checkpoint = this.checkpoint()
          checkpoint.world = next
          const record = checkpoint.records.find(r => r.command.commandId === commandId)
          if (record) record.status = 'completed'
          try { this.persistence?.save(checkpoint) }
          catch (error) { throw new SceneFault('PERSISTENCE_FAILED', `地图未应用，存档失败：${error instanceof Error ? error.message : String(error)}`) }
          this.world = next; this.defineResources(); this.editor = undefined; this.editing = false
          this.emit('layout.changed', { layoutRevision: next.layoutRevision })
          break
        }
      }
    }
    this.emit('editor.changed', { editing: this.editing, draftId: this.editor?.id, draftRevision: this.editor?.snapshot().revision })
  }
  setPluginEnabled(id: string, enabled: boolean) {
    this.plugins.setEnabled(id, enabled, pluginId => [...this.activities.values()].some(a => a.pluginId === pluginId && a.status === 'active') || [...this.records.values()].some(r => r.status === 'queued' && r.command.type === 'activity.start' && this.plugins.capability(r.command.capability).pluginId === pluginId))
    this.emit('plugin.changed', { pluginId: id, enabled })
  }

  private endActivity(activity: Activity, status: Activity['status'], error?: { code: string; message: string }) {
    if (activity.status !== 'active') return
    activity.status = status; activity.error = error
    this.startedAt.delete(activity.id); this.phaseReady.delete(activity.id)
    const settling: string[] = []
    for (const id of activity.participants) {
      const actor = this.actor(id)
      if (activity.plan.claims.some(c => c.resource === `actor:${id}:body`)) {
        this.movement.cancel(actor, status !== 'completed')
        this.movement.releaseUse(this.world, actor)
        actor.expression = undefined
        if (this.movement.busy(actor) || this.movement.needsRelease(actor)) settling.push(id)
        else if (actor.posture === 'seated') actor.facing = 'back'
      }
      if (activity.plan.claims.some(c => c.resource === `actor:${id}:speech`)) actor.speech = undefined
    }
    if (settling.length && !this.disposed) this.settling.set(activity.id, settling)
    else this.resources.release(activity.id)
    const record = this.records.get(activity.commandId)!
    if (!terminal(record.status)) this.finish(record, status === 'completed' ? 'completed' : status === 'cancelled' ? 'cancelled' : 'failed', error)
    this.persist()
    this.emit('activity.ended', { activityId: activity.id, status, error })
  }

  private actor(id: string) { const actor = this.world.actors.find(a => a.id === id); if (!actor) throw new SceneFault('ENTITY_NOT_FOUND', id); return actor }
  private finish(record: CommandRecord, status: CommandRecord['status'], error?: CommandRecord['error']) {
    if (terminal(record.status)) return
    record.status = status; record.error = error
    this.persist()
    this.emit('command.status', { commandId: record.command.commandId, status, error, activityId: record.activityId })
  }
  private result(record: CommandRecord): CommandResult { return structuredClone({ commandId: record.command.commandId, status: record.status, error: record.error, activityId: record.activityId }) }
  private emit(type: string, data: Record<string, unknown>) {
    this.sequence++
    this.events.push({ eventId: `${this.runtimeId}:${this.sequence}`, sequence: this.sequence, sceneId: this.sceneId, runtimeId: this.runtimeId, type, timestamp: this.now(), data })
    if (this.events.length > 256) this.events.shift()
    this.revision++
    for (const listener of this.listeners) { try { listener() } catch { /* A view subscriber cannot stop the scene. */ } }
  }
  private prune() {
    if (this.records.size >= 500) for (const [id, r] of this.records) {
      if (terminal(r.status) && ![...this.activities.values()].some(a => a.commandId === id && a.status === 'active') && ![...this.records.values()].some(other => !terminal(other.status) && other.command.after?.includes(id))) { this.records.delete(id); if (this.records.size < 400) break }
    }
    if (this.activities.size > 200) for (const [id, a] of this.activities) if (a.status !== 'active') { this.activities.delete(id); if (this.activities.size <= 100) break }
  }
  checkpoint(): Checkpoint { return structuredClone({ version: 2, world: this.world, records: [...this.records.values()], pluginVersions: Object.fromEntries(this.plugins.list().map(p => [p.id, p.version])),
    activeActivities: [...this.activities.values()].filter(a => a.status === 'active').map(a => ({ id: a.id, commandId: a.commandId, capability: a.capability, title: a.plan.title })) }) }
  private persist() {
    if (!this.persistence || this.persistenceError) return
    try { this.persistence.save(this.checkpoint()) } catch (error) { this.persistenceError = `存档失败：${error instanceof Error ? error.message : String(error)}` }
  }
  recoverLayout() {
    if (this.disposed || !this.layoutRecovery || !this.persistence?.replaceWithBackup) throw new SceneFault('RECOVERY_UNAVAILABLE', '当前存档无法自动恢复布局')
    const { original, checkpoint } = this.layoutRecovery
    const restored = this.prepareRestoredCheckpoint(checkpoint)
    this.navigation.validate(restored.world)
    // Commit storage first; a quota or backup failure must leave the runtime locked.
    this.persistence.replaceWithBackup(original, { ...restored, activeActivities: [] })
    this.persistenceError = undefined
    this.layoutRecovery = undefined
    this.applyRestoredCheckpoint(restored)
    this.emit('runtime.layout-recovered', { layoutRevision: restored.world.layoutRevision })
  }
  private prepareRestoredCheckpoint(checkpoint: Checkpoint): Checkpoint {
    const restored = structuredClone(checkpoint)
    for (const actor of restored.world.actors) {
      actor.step = undefined; actor.motion = undefined; actor.seatTransition = undefined
      if (actor.homeId) { actor.position = this.navigation.anchor(restored.world, actor.homeId, 'seat'); actor.posture = 'seated'; actor.facing = 'back'; actor.using = { propId: actor.homeId, interactionId: 'seat' } }
      else { actor.posture = 'standing'; actor.using = undefined }
    }
    for (const record of restored.records) {
      if (!terminal(record.status)) {
        const wasRunning = record.status === 'running'
        record.status = 'failed'; record.error = { code: wasRunning ? 'OUTCOME_UNKNOWN' : 'RUNTIME_RESTARTED', message: wasRunning ? '执行中断，无法确认崩溃前的最终结果，未自动重放' : '页面重启，等待中的命令未自动重放' }
      }
    }
    return restored
  }
  private applyRestoredCheckpoint(checkpoint: Checkpoint) {
    this.world = checkpoint.world
    this.records = new Map(checkpoint.records.map(record => [record.command.commandId, record]))
    for (const activity of checkpoint.activeActivities) this.emit('activity.ended', { activityId: activity.id, title: activity.title, status: 'failed', error: { code: 'RUNTIME_RESTARTED', message: '页面重启，持续活动已结束，未自动重放' } })
    this.emit('runtime.restored', { commands: this.records.size })
  }
  private offerLayoutRecovery(checkpoint: Checkpoint, original: unknown) {
    const world = checkpoint.world
    const sameEntities = (saved: Array<{ id: string; templateId: string }>, current: Array<{ id: string; templateId: string }>) =>
      saved.length === current.length && saved.every(item => current.some(other => other.id === item.id && other.templateId === item.templateId))
    if (!sameEntities(world.props, this.world.props) || !sameEntities(world.actors, this.world.actors)) return
    const candidate = structuredClone(checkpoint)
    candidate.world.props.forEach(prop => { prop.position = { ...this.world.props.find(p => p.id === prop.id)!.position } })
    candidate.world.layoutRevision++
    try {
      this.navigation.validate(candidate.world)
      this.layoutRecovery = { original: structuredClone(original), checkpoint: candidate }
    } catch { /* Do not offer a reset that cannot produce a valid, complete layout. */ }
  }
  private restore() {
    if (!this.persistence) return
    try {
      const raw = this.persistence.load()
      if (raw == null) return
      const legacy = z.object({ version: z.literal(1), world: z.unknown() }).passthrough().safeParse(raw)
      const data = legacy.success ? { ...legacy.data, version: 2, world: migrateLegacyWorld(legacy.data.world, this.world, id => this.template(id), this.navigation) } : raw
      const envelope = z.object({ version: z.literal(2), world: worldSchema, records: z.array(z.object({ command: savedCommand, status: z.enum(['queued', 'running', 'completed', 'rejected', 'failed', 'cancelled', 'expired']), acceptedAt: z.number(), error: z.object({ code: z.string(), message: z.string() }).optional(), activityId: idSchema.optional() })).max(512), pluginVersions: z.record(z.string(), z.string()),
        activeActivities: z.array(z.strictObject({ id: idSchema, commandId: idSchema, capability: idSchema, title: z.string().max(200) })).max(128).default([]) }).parse(data)
      if (legacy.success) envelope.pluginVersions['scene.furniture'] = '1.0.0'
      if (envelope.world.sceneId !== this.sceneId || this.plugins.list().some(p => envelope.pluginVersions[p.id] !== p.version)) throw new Error('场景或插件版本不匹配')
      // Older checkpoints lack static room geometry; retain their layout and content.
      if (!envelope.world.walkableArea && this.world.walkableArea && envelope.world.width === this.world.width && envelope.world.height === this.world.height) {
        envelope.world.walkableArea = structuredClone(this.world.walkableArea)
      }
      try { this.navigation.validate(envelope.world) }
      catch (error) {
        if (error instanceof SceneFault && ['OVERLAP', 'OUT_OF_BOUNDS', 'SEAT_BLOCKED', 'NO_ROUTE'].includes(error.code)) this.offerLayoutRecovery(envelope, raw)
        throw error
      }
      const prepared = this.prepareRestoredCheckpoint(envelope)
      if (legacy.success) {
        if (!this.persistence.replaceWithBackup) throw new Error('迁移需要支持备份的存储适配器，原存档未覆盖')
        this.persistence.replaceWithBackup(raw, { ...prepared, activeActivities: [] })
      }
      this.applyRestoredCheckpoint(prepared)
    } catch (error) {
      this.persistenceError = this.layoutRecovery && this.persistence.replaceWithBackup
        ? '旧存档的桌椅布局不兼容，任务已暂停。可备份并恢复默认位置，人物、白板内容和任务记录会保留。'
        : `原存档已保留，未覆盖：${error instanceof Error ? error.message : String(error)}`
    }
  }
  dispose() {
    if (this.disposed) return
    this.disposed = true
    for (const activity of this.activities.values()) if (activity.status === 'active') this.endActivity(activity, 'cancelled', { code: 'RUNTIME_DISPOSED', message: '场景已关闭' })
    for (const id of this.settling.keys()) this.resources.release(id)
    this.settling.clear()
    for (const record of this.records.values()) if (!terminal(record.status)) this.finish(record, 'cancelled')
    this.listeners.clear()
  }
}
