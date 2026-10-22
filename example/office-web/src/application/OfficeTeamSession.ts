import type { SceneRuntime } from '@pixoffice/runtime/SceneRuntime'
import type { DashboardAction, DashboardSnapshot, OfficeDataSource } from '@pixoffice/protocol/dashboard'
import { parseDashboardSnapshot } from '@pixoffice/protocol/dashboard'
import { DashboardSceneBridge } from '../dashboard/sceneBridge.ts'
import { OfficeDemoSource } from '../dashboard/OfficeDemoSource.ts'
import { OfficeSimulation, advanceOfficeSimulations } from './OfficeSimulation.ts'
import { DecisionSession } from './decisions/DecisionSession.ts'
import type { DecisionRequest } from './decisions/DecisionSession.ts'
import { createDecisionPreview } from './decisions/preview.ts'
import { notifySubscribers } from '../notifications.ts'
import { ChatWorkspace } from '../chat/ChatWorkspace.ts'
import { PreviewChatSource } from '../chat/sources.ts'
import type { OfficeChatSource } from '@pixoffice/protocol/chat'
import type { ChatWorkspacePersistence } from '../chat/persistence.ts'
import { OfficeUiSession } from './OfficeUiSession.ts'
import type { OfficeUiAction, OfficeUiPresentation } from '@pixoffice/protocol/office-integration'
import { whiteboardTaskBoard, WhiteboardProgress } from '@pixoffice/scene-office/whiteboard'

export type OfficeTeamState = {
  dashboard: DashboardSnapshot | null
  dashboardError: string | null
  sceneLinkError: string | null
  connection: string
  pendingTaskIds: readonly string[]
  actionError: string | null
}

export type OfficeTeamTransport = (onStatus: (status: string) => void) => () => void

/** Owns data consumption for one team, independently of which canvas is visible. */
export class OfficeTeamSession {
  readonly runtime: SceneRuntime
  readonly source: OfficeDataSource
  readonly simulation: OfficeSimulation
  readonly decisions: DecisionSession
  readonly decisionPreviewEnabled: boolean
  readonly chat: ChatWorkspace
  readonly ui: OfficeUiSession
  readonly whiteboardProgress = new WhiteboardProgress({ reduceMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches })
  private readonly bridge: DashboardSceneBridge
  private readonly transport?: OfficeTeamTransport
  private readonly listeners = new Set<() => void>()
  private state: OfficeTeamState
  private active = false
  private generation = 0
  private pending = false
  private flight?: { generation: number; promise: Promise<void> }
  private unsubscribe?: () => void
  private disconnect?: () => void
  private actions = new Map<string, Promise<void>>()
  private decisionPreviewKind?: DecisionRequest['kind']
  private selectedConversationId = ''

  constructor(runtime: SceneRuntime, source: OfficeDataSource, options: { simulation?: OfficeSimulation; transport?: OfficeTeamTransport; decisionPreview?: boolean; chatSource?: OfficeChatSource; chatPersistence?: ChatWorkspacePersistence; requestUi?: (action: OfficeUiAction) => Promise<OfficeUiPresentation> } = {}) {
    if (source.kind !== 'example' && options.simulation?.canDemo) throw new Error('真实数据团队不能使用演示数据源')
    this.runtime = runtime; this.source = source; this.transport = options.transport
    this.decisionPreviewEnabled = options.decisionPreview === true && source.kind === 'example'
    const leader = runtime.readActors()[0]
    this.decisions = new DecisionSession(runtime.sceneId, () => {
      if (!this.decisionPreviewEnabled || !this.decisionPreviewKind) return []
      return createDecisionPreview(runtime.sceneId, { name: leader?.name ?? '办公室负责人', appearanceId: leader?.templateId ?? 'office-lead' })
        .filter(request => request.kind === this.decisionPreviewKind)
        .map(request => ({ ...request, conversationId: this.chat.getSnapshot().selectedId }))
    })
    this.chat = new ChatWorkspace(runtime.sceneId, options.chatSource ?? new PreviewChatSource(), {
      persistence: options.chatPersistence,
      onRemoved: id => this.decisions.removeConversation(id),
      requestDelete: source.kind === 'example' ? undefined : async conversationId => {
        if (!options.requestUi) throw new Error('当前连接未提供会话删除处理')
        const result = await options.requestUi({ id: crypto.randomUUID(), teamId: runtime.sceneId, conversationId, action: 'conversation.delete' })
        if (result.target !== 'result' || !result.success) throw new Error(result.target === 'result' ? result.message || '后端未同意删除会话' : '后端未返回会话删除确认')
      },
    })
    this.ui = new OfficeUiSession(runtime.sceneId, options.requestUi, () => this.chat.getSnapshot().selectedId)
    this.simulation = options.simulation ?? new OfficeSimulation(runtime, source.kind === 'example' ? new OfficeDemoSource(runtime) : undefined)
    if (this.simulation.runtime !== runtime) throw new Error('团队会话与动画必须使用同一个运行时')
    this.bridge = new DashboardSceneBridge(runtime, { whiteboard: source.kind === 'example' ? 'demo-summary' : 'external' })
    this.state = { dashboard: null, dashboardError: null, sceneLinkError: null, connection: options.transport ? '连接中' : source.kind === 'example' ? '本地示例' : '未配置', pendingTaskIds: [], actionError: null }
    this.chat.subscribe(() => {
      const id = this.chat.getSnapshot().selectedId
      if (id === this.selectedConversationId) return
      this.selectedConversationId = id
      this.whiteboardProgress.setScope(id)
      this.ui.close()
      this.source.selectConversation?.(id)
      this.update({ dashboard: null, actionError: null, pendingTaskIds: this.pendingTasks(id) })
      if (this.active && this.source.selectConversation) void this.refresh()
    })
  }

  getSnapshot = () => this.state
  get isStarted() { return this.active }
  showDecisionPreview(kind: DecisionRequest['kind']) {
    if (!this.decisionPreviewEnabled) return
    this.decisionPreviewKind = kind
    this.decisions.reset()
  }
  setConnection(connection: string) { this.update({ connection }) }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }

  start() {
    if (this.active) return this.flight?.promise ?? Promise.resolve()
    this.active = true
    const generation = ++this.generation
    try {
      this.decisions.start()
      this.unsubscribe = this.source.subscribe(() => { if (this.isCurrent(generation)) void this.refresh() })
      this.disconnect = this.transport?.(connection => { if (this.isCurrent(generation)) this.update({ connection }) })
      return this.refresh()
    } catch (error) {
      this.active = false; this.generation++; this.pending = false
      this.decisions.stop()
      this.releaseConnections()
      this.update({ dashboardError: `团队启动失败：${error instanceof Error ? error.message : String(error)}`, ...(this.transport ? { connection: '未连接' } : {}) })
      return Promise.resolve()
    }
  }

  stop() {
    this.decisions.stop()
    this.decisions.clearReceipt()
    this.chat.stop()
    if (!this.active) return
    this.active = false; this.generation++; this.pending = false
    this.releaseConnections()
  }

  private releaseConnections() {
    const cleanup = [this.unsubscribe, this.disconnect]
    this.unsubscribe = undefined; this.disconnect = undefined
    for (const release of cleanup) {
      try { release?.() } catch (error) { console.warn('[OfficeTeamSession] connection cleanup failed', error) }
    }
  }

  refresh = (): Promise<void> => {
    if (!this.active) return Promise.resolve()
    this.pending = true
    if (this.flight?.generation === this.generation) return this.flight.promise
    const flight = { generation: this.generation, promise: Promise.resolve() }
    this.flight = flight
    flight.promise = this.drain(flight.generation).finally(() => {
      if (this.flight !== flight) return
      this.flight = undefined
      if (this.pending && this.isCurrent(flight.generation)) return this.refresh()
    })
    return flight.promise
  }

  execute = (action: DashboardAction): Promise<void> => {
    const conversationId = this.selectedConversationId
    const key = JSON.stringify([conversationId, action.taskId])
    const existing = this.actions.get(key)
    if (existing) return existing
    const pending = Promise.resolve().then(async () => {
      if (conversationId !== this.selectedConversationId) throw new Error('会话已切换，请在原会话重试')
      if (this.ui.enabled) {
        await this.ui.request(action.type === 'task.assign' ? { action: action.type, taskId: action.taskId, assigneeId: action.assigneeId }
          : { action: action.type, taskId: action.taskId })
      }
      else await this.source.execute(action)
      await this.refresh()
    }).catch(error => {
      if (conversationId === this.selectedConversationId) this.update({ actionError: error instanceof Error ? error.message : '业务操作失败' })
      throw error
    }).finally(() => {
      this.actions.delete(key)
      this.update({ pendingTaskIds: this.pendingTasks(this.selectedConversationId) })
    })
    this.actions.set(key, pending)
    this.update({ pendingTaskIds: this.pendingTasks(conversationId), actionError: null })
    return pending
  }

  private pendingTasks(conversationId: string) {
    return [...this.actions.keys()].map(key => JSON.parse(key) as [string, string]).filter(([id]) => id === conversationId).map(([, id]) => id)
  }

  private isCurrent(generation: number) { return this.active && generation === this.generation }
  private update(change: Partial<OfficeTeamState>) {
    this.state = { ...this.state, ...change }
    notifySubscribers(this.listeners, 'OfficeTeamSession')
  }

  private async drain(generation: number) {
    // Serialize invalidations so a slower response cannot overwrite a newer one.
    while (this.isCurrent(generation) && this.pending) {
      this.pending = false
      try {
        const conversations = this.source.getConversations?.()
        if (conversations) { await this.chat.ready; this.chat.sync(conversations) }
        const selectedId = this.selectedConversationId
        if (conversations) this.source.selectConversation?.(selectedId)
        const dashboard = parseDashboardSnapshot(await this.source.getSnapshot())
        if (!conversations) await this.chat.ready
        if (selectedId !== this.selectedConversationId) { this.pending = true; continue }
        if (!conversations) this.chat.sync([{ id: dashboard.conversationId ?? 'main', title: dashboard.workspace.name,
          employees: dashboard.employees, tasks: dashboard.tasks, events: dashboard.events, whiteboard: dashboard.whiteboard }])
        if (!this.isCurrent(generation)) return
        let sceneLinkError: string | null
        try { sceneLinkError = this.bridge.sync(dashboard, { replayEvents: this.source.replayEvents }).join('；') || null }
        catch (error) { sceneLinkError = error instanceof Error ? error.message : '场景同步失败' }
        for (const prop of this.runtime.readWorld().props) {
          const board = whiteboardTaskBoard(prop.state)
          if (board) this.whiteboardProgress.project(prop.id, board)
        }
        this.update({ dashboard, dashboardError: null, sceneLinkError })
      } catch (error) {
        if (!this.isCurrent(generation)) return
        this.update({ dashboardError: error instanceof Error ? error.message : '页面数据不可用' })
      }
    }
  }
}

/** The clock interpolates accepted actions; only the opt-in example source creates demo commands. */
export function advanceOfficeTeamSessions(sessions: Iterable<OfficeTeamSession>, elapsedMs: number) {
  const current = [...sessions]
  advanceOfficeSimulations(current.map(session => session.simulation), elapsedMs)
  const bounded = Number.isFinite(elapsedMs) ? Math.max(0, Math.min(elapsedMs, 1000)) : 0
  for (const session of current) session.simulation.demoSource?.tick(bounded)
}
