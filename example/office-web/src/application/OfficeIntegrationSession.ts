import { maxRelayTeams, relayMessageSchema } from '@pixoffice/protocol/relay'
import { officeClosedSchema, officeDeliverySchema, officeMessageSchema, officeSyncSchema, officeSyncStartSchema, officeSyncCompleteSchema, officeBrowserResultSchema, officeErrorResultSchema, describeOfficeRuntime, unavailableOfficeRuntime, defaultOfficeLayout, officeLayoutStateSchema, officeLayoutSyncSchema, describeOfficeLayouts, officeChatUpdatedSchema } from '@pixoffice/protocol/office-integration'
import type { OfficeDelivery, OfficeReply, OfficeRequest, OfficeSnapshot, OfficeLayoutId, OfficeLayoutState } from '@pixoffice/protocol/office-integration'
import type { MessageTransport } from '@pixoffice/runtime/adapters/messages'
import { canonical, idSchema } from '@pixoffice/protocol'
import { parseProtocolObject, stringifyProtocolObject } from '@pixoffice/protocol/schema'
import { describeOfficeScene } from '@pixoffice/scene-office/core'
import type { OfficeTeamSession } from './OfficeTeamSession.ts'
import { PushOfficeDataSource } from '../dashboard/PushOfficeDataSource.ts'
import { notifySubscribers } from '../notifications.ts'

export type ConnectedOffice = { id: string; name: string; sceneLabel: string; session: OfficeTeamSession; source: PushOfficeDataSource }
type Options = {
  transport: MessageTransport
  reply: (reply: OfficeReply) => Promise<void>
  createSession: (source: PushOfficeDataSource, id: string) => OfficeTeamSession
  changeLayout?: (layoutId: OfficeLayoutId) => Promise<OfficeLayoutState>
  storage?: Pick<Storage, 'getItem' | 'setItem'>
}
const storageKey = 'pixoffice:connected-offices:v6'
class IntegrationFault extends Error {
  readonly reasonCode: string
  readonly code: OfficeReply['result']['code']
  constructor(reasonCode: string, message: string, code: OfficeReply['result']['code'] = 422) { super(message); this.reasonCode = reasonCode; this.code = code }
}

/** Office-specific integration; core animation transport remains scene-independent. */
export class OfficeIntegrationSession {
  private readonly options: Options
  private offices = new Map<string, ConnectedOffice>()
  private state: { offices: readonly ConnectedOffice[]; connection: string; error: string | null; layout: OfficeLayoutState; layoutBusy: boolean } = {
    offices: [], connection: '连接中', error: null, layout: { ...defaultOfficeLayout }, layoutBusy: false }
  private listeners = new Set<() => void>()
  private disconnect?: () => void
  private active = false
  private generation = 0
  private connectionGeneration = 0
  private transportOpen = false
  private restored = false
  private writableCache = true
  private stateId = ''
  private work = Promise.resolve()
  private pendingWork = 0
  private resyncRequired = false
  private layoutSyncError = false
  private layoutChangeGeneration = 0
  private chatRecoveryNeeded = false
  private bindings = new Map<string, { session: OfficeTeamSession; decisionId: string }>()
  private submitting = new Set<string>()

  constructor(options: Options) { this.options = options }
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  refreshChatHistory = () => { for (const office of this.offices.values()) office.session.chat.invalidateHistory() }

  selectLayout = async (layoutId: OfficeLayoutId) => {
    if (this.state.layoutBusy) return
    if (!this.active || !this.options.changeLayout) { this.update({ error: '布局连接不可用' }); return }
    const generation = this.generation, stateId = this.stateId, change = ++this.layoutChangeGeneration
    const current = () => this.active && generation === this.generation && stateId === this.stateId && change === this.layoutChangeGeneration
    this.update({ layoutBusy: true, error: null })
    try {
      const selection = await this.options.changeLayout(layoutId)
      if (current()) { this.applyLayout(selection); this.persist() }
    } catch (error) {
      if (current()) this.update({ error: `布局切换失败：${error instanceof Error ? error.message : String(error)}` })
    } finally { if (current()) this.update({ layoutBusy: false }) }
  }

  private applyLayout(layout: OfficeLayoutState, reset = false) {
    const previous = this.state.layout
    if (reset || layout.revision > previous.revision) this.update({ layout: { ...layout } })
    else if (layout.revision === previous.revision && layout.currentLayoutId !== previous.currentLayoutId) throw new IntegrationFault('LAYOUT_CONFLICT', '相同布局版本对应不同布局', 409)
  }

  async start() {
    if (this.active) return
    this.active = true
    const generation = ++this.generation
    if (!this.restored) {
      this.restored = true
      try {
        const raw = this.options.storage?.getItem(storageKey)
        if (raw) {
          const cached: unknown = parseProtocolObject(raw)
          if (!cached || typeof cached !== 'object' || !('version' in cached) || cached.version !== 6 || !('offices' in cached) || !('layout' in cached)
            || !('stateId' in cached) || cached.stateId !== '' && !idSchema.safeParse(cached.stateId).success) throw new Error('缓存格式无效')
          const message = officeMessageSchema.parse({ type: 'offices.initialize', offices: cached.offices })
          this.stateId = cached.stateId as string
          this.applyLayout(officeLayoutStateSchema.parse(cached.layout), true)
          if (message.type === 'offices.initialize') await this.initialize(message.offices, false, true)
        }
      } catch { this.writableCache = false; this.update({ error: '办公室缓存无法读取，原缓存未覆盖；可继续接收后端初始化。' }) }
    }
    if (this.active && generation === this.generation) this.connect()
  }

  stop() {
    this.active = false; this.transportOpen = false; this.generation++
    this.layoutChangeGeneration++; this.resyncRequired = false
    if (this.state.layoutBusy) this.update({ layoutBusy: false })
    const disconnect = this.disconnect; this.disconnect = undefined
    try { disconnect?.() } catch (error) { console.warn('[OfficeIntegration] disconnect failed', error) }
    for (const { session, decisionId } of this.bindings.values()) session.decisions.dismiss(decisionId)
    this.bindings.clear()
    for (const office of this.offices.values()) office.session.stop()
  }

  receive = (value: unknown) => {
    if (!this.active) return
    const start = officeSyncStartSchema.safeParse(value)
    if (start.success) {
      this.queue(async () => {
        const replaced = this.stateId !== start.data.stateId
        if (replaced) {
          this.layoutChangeGeneration++
          for (const id of [...this.offices.keys()]) this.removeOffice(id)
          this.stateId = start.data.stateId
          this.update({ offices: [], error: null, layoutBusy: false })
        }
        this.applyLayout(start.data.layout, replaced || start.data.layout.revision === this.state.layout.revision)
        if (this.layoutSyncError) { this.layoutSyncError = false; this.update({ error: null }) }
        this.persist()
        return null
      })
      return
    }
    const layout = officeLayoutSyncSchema.safeParse(value)
    if (layout.success) {
      this.queue(async () => {
        try { this.applyLayout(layout.data.layout); this.persist() }
        catch { this.layoutSyncError = true; this.requireResync('布局状态存在冲突，正在恢复最新选择。') }
        return null
      })
      return
    }
    const complete = officeSyncCompleteSchema.safeParse(value)
    if (complete.success) {
      this.queue(async () => {
        if (!this.transportOpen) return null
        const ids = new Set(complete.data.offices.map(item => item.teamId))
        for (const id of [...this.offices.keys()]) if (!ids.has(id)) this.removeOffice(id)
        this.update({ offices: [...this.offices.values()] })
        if (this.chatRecoveryNeeded) {
          this.chatRecoveryNeeded = false
          this.refreshChatHistory()
        }
        this.persist()
        const ready = complete.data.offices.every(item => { const office = this.offices.get(item.teamId); return office && office.source.readSnapshot().seq >= item.seq && !office.session.getSnapshot().sceneLinkError && !office.session.getSnapshot().dashboardError })
        this.setConnection(!ready ? '状态同步失败' : complete.data.offices.length ? '已连接' : '已连接，等待后端初始化')
        return null
      })
      return
    }
    const sync = officeSyncSchema.safeParse(value)
    if (sync.success) {
      this.queue(async () => { await this.initialize([sync.data.snapshot], true, true); return null })
      return
    }
    const chatUpdated = officeChatUpdatedSchema.safeParse(value)
    if (chatUpdated.success) {
      this.queue(async () => {
        this.offices.get(chatUpdated.data.teamId)?.session.chat.invalidateHistory(chatUpdated.data.conversationId)
        return null
      })
      return
    }
    const closed = officeClosedSchema.safeParse(value)
    if (closed.success) {
      const token = closed.data.responseToken, binding = this.bindings.get(token)
      this.bindings.delete(token)
      if (binding && !this.submitting.has(token)) binding.session.decisions.dismiss(binding.decisionId)
      return
    }
    const scene = relayMessageSchema.safeParse(value)
    if (scene.success) {
      const session = this.offices.get(scene.data.teamId)?.session
      if (scene.data.conversationId && session?.chat.getSnapshot().selectedId !== scene.data.conversationId) return
      const runtime = session?.runtime
      if (!runtime) return
      const command = scene.data.command
      const results = 'commands' in command ? runtime.submitBatch(command) : [runtime.submit(command)]
      for (const result of results) if (result.error) console.warn('[OfficeIntegration] animation skipped', result)
      return
    }
    const parsed = officeDeliverySchema.safeParse(value)
    if (!parsed.success) { console.warn('[OfficeIntegration] invalid message skipped'); return }
    const delivery = parsed.data
    const deadline = performance.now() + delivery.remainingMs
    const localExpiresAt = Date.now() + delivery.remainingMs
    if (this.pendingWork >= 128) { void this.respond(delivery, 503, '前端业务处理队列已满', { reasonCode: 'BUSINESS_QUEUE_FULL' }).catch(() => {}); return }
    this.queue(async () => {
      if (performance.now() >= deadline) return null
      try { return await this.handle(delivery, { deadline, expiresAt: localExpiresAt }) }
      catch (error) { return this.result(delivery, error instanceof IntegrationFault ? error.code : 422, error instanceof Error ? error.message : '业务消息处理失败',
        { reasonCode: error instanceof IntegrationFault ? error.reasonCode : 'BUSINESS_ERROR' }) }
    })
  }

  private requireResync(message: string) {
    if (this.resyncRequired) return
    this.resyncRequired = true; this.transportOpen = false; this.chatRecoveryNeeded = true
    this.connectionGeneration++
    const disconnect = this.disconnect; this.disconnect = undefined
    try { disconnect?.() } catch (error) { console.warn('[OfficeIntegration] disconnect failed', error) }
    this.setConnection('等待恢复最新状态')
    this.update({ error: message })
  }

  private queue(task: () => Promise<OfficeReply | null>) {
    if (this.pendingWork >= 128) { this.requireResync('前端业务处理队列已满，正在恢复最新状态。'); return }
    const generation = this.generation
    this.pendingWork++
    const work = this.work.then(async () => {
      if (!this.active || generation !== this.generation) return null
      return task()
    })
    this.work = work.then(() => {}, () => {}).finally(() => {
      this.pendingWork--
      if (!this.pendingWork && this.active && this.resyncRequired) {
        this.resyncRequired = false
        this.setConnection('正在同步最新状态')
        this.connect()
      }
    })
    void work.then(result => { if (result && this.active && generation === this.generation) return this.options.reply(result) }).catch(error => {
      // Another page may have answered first, or the original HTTP request has ended.
      if (error && typeof error === 'object' && 'status' in error && error.status === 410) return
      if (this.active && generation === this.generation) this.update({ error: `业务结果发送失败：${String(error)}` })
    })
  }

  private connect() {
    const generation = ++this.connectionGeneration
    const disconnect = this.disconnect; this.disconnect = undefined
    try { disconnect?.() } catch (error) { console.warn('[OfficeIntegration] disconnect failed', error) }
    try { this.disconnect = this.options.transport.connect({ teamIds: [], workspace: true,
      onMessage: message => { if (this.active && generation === this.connectionGeneration) this.receive(message) },
      onStatus: connection => {
        if (!this.active || generation !== this.connectionGeneration) return
        if (connection !== '已连接' && this.offices.size) this.chatRecoveryNeeded = true
        this.transportOpen = connection === '已连接'
        this.setConnection(connection === '已连接' ? '正在同步最新状态' : connection)
      },
    }) } catch (error) { this.update({ connection: '未连接', error: `消息连接失败：${String(error)}` }) }
  }
  private setConnection(connection: string) {
    for (const office of this.offices.values()) office.session.setConnection(connection)
    this.update({ connection })
  }

  private removeOffice(id: string) {
    const office = this.offices.get(id)
    if (!office) return
    for (const [token, binding] of this.bindings) if (binding.session === office.session) this.bindings.delete(token)
    office.session.decisions.reset()
    office.session.stop()
    office.session.runtime.dispose()
    this.offices.delete(id)
  }

  private async initialize(snapshots: OfficeSnapshot[], persist = true, recovery = false) {
    if (new Set([...this.offices.keys(), ...snapshots.map(snapshot => snapshot.workspace.id)]).size > maxRelayTeams) throw new IntegrationFault('OFFICE_LIMIT', `最多支持 ${maxRelayTeams} 个办公室`)
    const accepted = snapshots.filter(snapshot => {
      const previous = this.offices.get(snapshot.workspace.id)?.source.readSnapshot()
      if (previous && snapshot.seq === previous.seq && canonical(snapshot) !== canonical(previous)) throw new IntegrationFault('SEQ_CONFLICT', '相同 seq 不能对应不同快照', 409)
      return !previous || snapshot.seq >= previous.seq
    })
    const staged: ConnectedOffice[] = []
    try {
      for (const snapshot of accepted) {
        let office = this.offices.get(snapshot.workspace.id)
        if (!office) {
          const source = new PushOfficeDataSource(snapshot)
          office = { id: snapshot.workspace.id, name: snapshot.workspace.name, sceneLabel: '办公室', source, session: this.options.createSession(source, snapshot.workspace.id) }
          staged.push(office)
        }
        this.validateBindings(office, snapshot)
      }
    } catch (error) { staged.forEach(office => office.session.runtime.dispose()); throw error }
    for (const office of staged) this.offices.set(office.id, office)
    for (const snapshot of accepted) {
      const office = this.offices.get(snapshot.workspace.id)!
      const repeated = snapshot.seq === office.source.readSnapshot().seq
      this.offices.set(office.id, { ...office, name: snapshot.workspace.name }); office.source.update(snapshot, recovery || repeated)
      await office.session.start(); await office.session.refresh()
      office.session.setConnection(this.state.connection)
      if (office.session.getSnapshot().dashboardError) throw new IntegrationFault('BUSINESS_ERROR', office.session.getSnapshot().dashboardError!)
      if (office.session.getSnapshot().sceneLinkError) throw new IntegrationFault('SCENE_SYNC_FAILED', office.session.getSnapshot().sceneLinkError!)
    }
    this.update({ offices: [...this.offices.values()], error: this.resyncRequired ? this.state.error : null })
    if (persist) this.persist()
  }

  private validateBindings(office: ConnectedOffice, snapshot: OfficeSnapshot) {
    const actors = new Set(office.session.runtime.readActors().map(actor => actor.id))
    for (const conversation of snapshot.conversations) for (const employee of conversation.employees) if (employee.sceneActorId && !actors.has(employee.sceneActorId)) throw new IntegrationFault('INVALID_BINDING', `人物不存在：${employee.sceneActorId}`)
  }

  private async handle(delivery: OfficeDelivery, timing: { deadline: number; expiresAt: number }): Promise<OfficeReply | null> {
    const request = delivery.request
    if (request.type === 'office.layout.set') {
      if (request.layoutId !== this.state.layout.currentLayoutId) throw new IntegrationFault('LAYOUT_CONFLICT', '布局已被更新，请重新查询当前布局', 409)
      return this.result(delivery, 200, 'OK', describeOfficeLayouts(this.state.layout))
    }
    if (request.type === 'offices.initialize') {
      await this.initialize(request.offices)
      if (this.transportOpen) this.setConnection('已连接')
      return this.result(delivery, 200, 'Offices initialized', this.describe())
    }
    if (request.type === 'office.read' && !request.teamId) return this.result(delivery, 200, 'OK', this.describe())
    const teamId = 'teamId' in request ? request.teamId : undefined
    const office = teamId && this.offices.get(teamId)
    if (!office) return this.result(delivery, 404, '办公室未初始化', { reasonCode: 'OFFICE_NOT_INITIALIZED' })
    if (request.type === 'office.read') return this.result(delivery, 200, 'OK', this.describeOffice(office))
    if (request.type === 'office.snapshot') {
      const previous = office.source.readSnapshot()
      await this.initialize([request.snapshot])
      const ignored = request.snapshot.seq < previous.seq
      return this.result(delivery, 200, ignored ? 'Snapshot ignored' : 'Snapshot applied', { teamId: office.id, seq: Math.max(previous.seq, request.snapshot.seq),
        status: ignored ? 'ignored' : 'applied', ...(ignored ? { reasonCode: 'STALE_SEQ' } : {}) })
    }
    if (request.type === 'decision.request') this.enqueueDecision(office, request, delivery, timing)
    return null
  }

  private enqueueDecision(office: ConnectedOffice, request: Extract<OfficeRequest, { type: 'decision.request' }>, delivery: OfficeDelivery, timing: { deadline: number; expiresAt: number }) {
    const decision = request.decision
    if (!office.source.getConversations().some(item => item.id === request.conversationId)) throw new IntegrationFault('CONVERSATION_NOT_FOUND', '审批所属会话不存在', 404)
    const actor = decision.actorId ? office.session.runtime.readActors().find(actor => actor.id === decision.actorId) : office.session.runtime.readActors()[0]
    if (!actor) throw new IntegrationFault('ACTOR_NOT_FOUND', '菜单发起人物不存在')
    const token = delivery.responseToken
    const entry = { ...decision, teamId: office.id, conversationId: request.conversationId, requester: { name: actor.name, appearanceId: actor.templateId },
      createdAt: timing.expiresAt - request.timeoutMs, expiresAt: timing.expiresAt, deadline: timing.deadline }
    const reason = office.session.decisions.enqueueError(entry)
    if (reason) throw new IntegrationFault(reason, reason === 'DECISION_DUPLICATE' ? '菜单 ID 已使用' : reason === 'DECISION_EXPIRED' ? '菜单已过期' : '菜单等待队列已满', reason === 'DECISION_QUEUE_FULL' ? 503 : 409)
    const accepted = office.session.decisions.enqueue(entry, async choiceId => {
      this.submitting.add(token)
      try {
        const label = decision.kind === 'choice' ? decision.options.find(option => option.id === choiceId)!.label
          : choiceId === 'confirm' ? decision.confirmLabel : decision.rejectLabel
        await this.respond(delivery, 200, 'User selected', { teamId: office.id, conversationId: request.conversationId, decisionId: decision.id, choiceId, label })
        this.bindings.delete(token)
      } catch (error) {
        if (error && typeof error === 'object' && 'status' in error && error.status === 410) {
          office.session.decisions.dismiss(decision.id); this.bindings.delete(token)
        }
        throw error
      } finally { this.submitting.delete(token) }
    })
    if (!accepted) throw new IntegrationFault('DECISION_QUEUE_FULL', '菜单等待队列已满')
    this.bindings.set(token, { session: office.session, decisionId: decision.id })
  }

  private describe() {
    return { offices: [...this.offices.values()].map(office => this.describeOffice(office)) }
  }
  private describeOffice(office: ConnectedOffice) {
    const state = office.session.getSnapshot()
    return { id: office.id, seq: office.source.readSnapshot().seq,
      runtime: state.sceneLinkError || state.dashboardError ? unavailableOfficeRuntime()
        : describeOfficeRuntime(describeOfficeScene(office.session.runtime), office.session.chat.getSnapshot().selectedId, office.session.decisions.getSnapshot().pending.map(item => item.id)) }
  }
  private persist() {
    if (!this.options.storage || !this.writableCache) return
    try { this.options.storage.setItem(storageKey, stringifyProtocolObject({ version: 6, stateId: this.stateId, layout: this.state.layout, offices: [...this.offices.values()].map(office => office.source.readSnapshot()) })) }
    catch { this.update({ error: '办公室状态已更新，但浏览器缓存写入失败；刷新后需要后端重新同步。' }) }
  }
  private result(delivery: OfficeDelivery, code: OfficeReply['result']['code'], msg: string, result: unknown): OfficeReply {
    return { responseToken: delivery.responseToken, result: { code, msg: msg.slice(0, 500),
      data: code === 200 ? officeBrowserResultSchema(delivery.request.type, delivery.request.type === 'office.read' && Boolean(delivery.request.teamId)).parse(result) : officeErrorResultSchema.parse(result) } }
  }
  private respond(delivery: OfficeDelivery, code: OfficeReply['result']['code'], msg: string, result: unknown) {
    return this.options.reply(this.result(delivery, code, msg, result))
  }
  private update(change: Partial<typeof this.state>) { this.state = { ...this.state, ...change }; notifySubscribers(this.listeners, 'OfficeIntegrationSession') }
}
