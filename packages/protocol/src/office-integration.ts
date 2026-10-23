import { z } from 'zod'
import { idSchema, jsonObjectSchema, responseEnvelopeSchema } from './schema.ts'
import { dashboardSnapshotSchema, validateDashboardSnapshot } from './dashboard.ts'
import { whiteboardTaskBoardSchema, officeUiManifest, emptyWhiteboard } from './office-ui.ts'
import { officeChatConfigSchema, chatProtocolSchema, describeChatProtocol } from './chat.ts'
import { relayPaths, relayMessageSchema, maxRelayMessageBytes } from './relay.ts'

export const officeIntegrationPaths = { reply: '/api/pixoffice/reply', ui: '/api/pixoffice/ui', layout: '/api/pixoffice/layout' } as const
// Internal SSE subscription topic for the complete office workspace.
export const officeWorkspaceTopic = '@pixoffice/workspace'
const text = z.string().min(1).max(160)
const employeeSchema = dashboardSnapshotSchema.shape.employees.element
const taskSchema = dashboardSnapshotSchema.shape.tasks.element
const eventSchema = dashboardSnapshotSchema.shape.events.element
export const seqSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
const optionalId = z.union([idSchema, z.literal('')]).default('')
const unknownPercent = z.union([z.literal(-1), z.number().min(0).max(100)]).default(-1)
export const officeConversationSchema = z.strictObject({ id: idSchema, title: text,
  employees: z.array(employeeSchema.safeExtend({ sceneActorId: employeeSchema.shape.sceneActorId.default(''),
    role: z.string().max(80).default(''), online: z.boolean().default(false) })).max(200).default([]),
  tasks: z.array(taskSchema.safeExtend({ assigneeId: taskSchema.shape.assigneeId.default(''), progress: unknownPercent,
    summary: z.string().max(1000).default('') })).max(1000).default([]),
  events: z.array(eventSchema.safeExtend({
    taskId: eventSchema.shape.taskId.default(''), employeeId: eventSchema.shape.employeeId.default(''), fromEmployeeId: eventSchema.shape.fromEmployeeId.default(''),
  })).max(500).default([]),
  whiteboard: whiteboardTaskBoardSchema.default(emptyWhiteboard),
}).superRefine(validateDashboardSnapshot)
export type OfficeConversation = z.infer<typeof officeConversationSchema>
export const officeSnapshotSchema = z.strictObject({ schemaVersion: z.literal('1.0'), seq: seqSchema,
  workspace: dashboardSnapshotSchema.shape.workspace,
  conversations: z.array(officeConversationSchema).max(100).default([]),
  system: z.strictObject({ cpuPercent: unknownPercent, memoryPercent: unknownPercent,
    networkKbps: z.union([z.literal(-1), z.number().nonnegative()]).default(-1) }).default({ cpuPercent: -1, memoryPercent: -1, networkKbps: -1 }),
}).superRefine((snapshot, context) => {
  if (new Set(snapshot.conversations.map(item => item.id)).size !== snapshot.conversations.length) context.addIssue({ code: 'custom', path: ['conversations'], message: '会话 ID 重复' })
})
export type OfficeSnapshot = z.infer<typeof officeSnapshotSchema>
export const officeLayoutIdSchema = z.enum(['classic', 'members'])
export type OfficeLayoutId = z.infer<typeof officeLayoutIdSchema>
export const officeLayoutStateSchema = z.strictObject({ currentLayoutId: officeLayoutIdSchema, revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) })
export type OfficeLayoutState = z.infer<typeof officeLayoutStateSchema>
export const defaultOfficeLayout: OfficeLayoutState = Object.freeze({ currentLayoutId: 'classic', revision: 0 })
const officeLayoutDefinitionSchema = z.strictObject({
  id: officeLayoutIdSchema, name: z.string().min(1), dataMessageType: z.literal('office.snapshot'), dataSchema: jsonObjectSchema,
  ui: z.strictObject({ slots: z.array(z.string()), actions: z.array(z.string()), localControls: z.array(z.string()) }),
})
export const officeLayoutInfoSchema = officeLayoutStateSchema.safeExtend({ layouts: z.array(officeLayoutDefinitionSchema).min(1).max(officeLayoutIdSchema.options.length) }).superRefine((value, context) => {
  if (new Set(value.layouts.map(layout => layout.id)).size !== value.layouts.length) context.addIssue({ code: 'custom', path: ['layouts'], message: '布局 ID 不得重复' })
  if (!value.layouts.some(layout => layout.id === value.currentLayoutId)) context.addIssue({ code: 'custom', path: ['currentLayoutId'], message: '当前布局不在可选目录中' })
})
export const officeLayoutSetSchema = z.strictObject({ type: z.literal('office.layout.set'), layoutId: officeLayoutIdSchema })
const layoutDefinitions = [
  { id: 'classic' as const, name: '经典布局', dataMessageType: 'office.snapshot' as const, dataSchema: z.toJSONSchema(officeSnapshotSchema, { io: 'input' }),
    ui: { slots: officeUiManifest.slots.map(slot => slot.id), actions: [...officeUiManifest.actions], localControls: ['office.select', 'conversation.select', 'chat.expand', 'chat.collapse', 'actor.insights.pin'] } },
  { id: 'members' as const, name: '成员布局', dataMessageType: 'office.snapshot' as const, dataSchema: z.toJSONSchema(officeSnapshotSchema, { io: 'input' }),
    ui: { slots: officeUiManifest.slots.filter(slot => slot.id !== 'actor.insights').map(slot => slot.id), actions: officeUiManifest.actions.filter(action => action !== 'actor.inspect'),
      localControls: ['office.select', 'conversation.select', 'chat.expand', 'chat.collapse', 'employee.select', 'member-sidebar.expand', 'member-sidebar.collapse'] } },
]
export function describeOfficeLayouts(state: OfficeLayoutState = defaultOfficeLayout) { return { ...state, layouts: layoutDefinitions } }
export const officeLayoutSyncSchema = z.strictObject({ type: z.literal('office.layout.sync'), layout: officeLayoutStateSchema })
export const officeChatUpdatedSchema = z.strictObject({ type: z.literal('chat.updated'), teamId: idSchema, conversationId: idSchema })
export const officeChatUpdatedResultSchema = z.strictObject({ teamId: idSchema, conversationId: idSchema, forwarded: z.number().int().nonnegative() })
export const officeReasonSchema = z.enum(['INVALID_MESSAGE', 'INVALID_REPLY', 'OFFICE_NOT_INITIALIZED', 'ACTOR_NOT_FOUND', 'INVALID_BINDING',
  'OFFICE_LIMIT', 'CACHE_FULL', 'STALE_SEQ', 'DUPLICATE_SEQ', 'SEQ_CONFLICT', 'REQUEST_TIMEOUT', 'NO_RECEIVER', 'RECEIVER_UNAVAILABLE',
  'BUSINESS_QUEUE_FULL', 'DECISION_DUPLICATE', 'DECISION_EXPIRED', 'DECISION_QUEUE_FULL', 'SERVER_CLOSING', 'CALLER_DISCONNECTED',
  'SCENE_SYNC_FAILED', 'BUSINESS_ERROR', 'UI_REQUEST_EXPIRED', 'UI_QUEUE_FULL', 'UI_WAIT_BUSY', 'UNSUPPORTED_UI_ACTION', 'SNAPSHOT_REQUIRED',
  'AUTH_FAILED', 'FORBIDDEN', 'NOT_FOUND', 'MESSAGE_TOO_LARGE', 'INTERNAL_ERROR', 'REQUEST_CLOSED',
  'CHAT_NOT_CONFIGURED', 'CHAT_UPSTREAM_ERROR', 'CHAT_TIMEOUT', 'CONVERSATION_NOT_FOUND', 'LAYOUT_CONFLICT'])
export const officeErrorResultSchema = z.strictObject({ reasonCode: officeReasonSchema, details: jsonObjectSchema.default({}),
  issues: z.array(jsonObjectSchema).default([]) })

const jsonSchema = jsonObjectSchema
export const participantRulesSchema = z.strictObject({ min: z.number().int().nonnegative(), max: z.number().int().min(-1),
  roles: z.array(z.strictObject({ role: idSchema, min: z.number().int().nonnegative(), max: z.number().int().nonnegative() })), rules: z.array(z.string()) })
export const officeSceneSchema = z.strictObject({
  protocolVersion: z.literal('2.0'), sceneId: idSchema, command: jsonSchema, batch: jsonSchema,
  actors: z.array(z.strictObject({ id: idSchema, name: z.string(), templateId: idSchema, position: z.strictObject({ x: z.number().int(), y: z.number().int() }),
    presentation: z.strictObject({ status: z.enum(['idle', 'working', 'thinking']), title: z.string(), sourceRevision: z.number().int().nonnegative() }) })),
  objects: z.array(z.strictObject({ id: idSchema, name: z.string(), templateId: idSchema, state: jsonSchema, stateRevision: z.number().int().nonnegative(), stateSchema: jsonSchema.default({}),
    interactions: z.array(z.strictObject({ id: idSchema, name: z.string(), requiresHome: z.boolean(), actorIds: z.array(idSchema) })) })),
  capabilities: z.array(z.strictObject({ id: idSchema, name: z.string(), params: jsonSchema,
    participants: participantRulesSchema.default({ min: 0, max: -1, roles: [], rules: [] }) })),
})
const uiManifestSchema = z.strictObject({ slots: z.array(z.strictObject({ id: z.string(), content: z.string(), persistent: z.boolean(), update: z.string() })), actions: z.array(z.string()),
  actionSchema: jsonSchema, presentationSchema: jsonSchema, whiteboardSchema: jsonSchema })
export const officeRuntimeStateSchema = z.strictObject({
  available: z.boolean(), selectedConversationId: z.union([idSchema, z.literal('')]),
  actors: officeSceneSchema.shape.actors,
  objects: z.array(officeSceneSchema.shape.objects.element.omit({ stateSchema: true })), pendingDecisions: z.array(idSchema),
}).superRefine((value, context) => {
  if (!value.available && (value.selectedConversationId || value.actors.length || value.objects.length || value.pendingDecisions.length)) context.addIssue({ code: 'custom', message: '不可用的运行状态不得包含实时数据' })
})
export const unavailableOfficeRuntime = () => ({ available: false, selectedConversationId: '', actors: [], objects: [], pendingDecisions: [] })
export function describeOfficeRuntime(scene: z.infer<typeof officeSceneSchema>, selectedConversationId: string, pendingDecisions: string[]) {
  return officeRuntimeStateSchema.parse({ available: true, selectedConversationId, actors: scene.actors,
    objects: scene.objects.map(({ id, name, templateId, state, stateRevision, interactions }) => ({ id, name, templateId, state, stateRevision, interactions })), pendingDecisions })
}
export const officeReadResultSchema = z.strictObject({ snapshot: officeSnapshotSchema, runtime: officeRuntimeStateSchema })
export const officeRuntimeReceiptSchema = z.strictObject({ id: idSchema, seq: seqSchema, runtime: officeRuntimeStateSchema })
export const officeWorkspaceReceiptSchema = z.strictObject({ offices: z.array(officeRuntimeReceiptSchema).max(100) })
export const officeSnapshotResultSchema = z.strictObject({ teamId: idSchema, seq: seqSchema, status: z.enum(['applied', 'cached', 'ignored']), reasonCode: z.enum(['STALE_SEQ', 'DUPLICATE_SEQ']).optional() })
export const officeDecisionResultSchema = z.strictObject({ teamId: idSchema, conversationId: idSchema, decisionId: idSchema, choiceId: idSchema, label: text })
export const officeCapabilitiesResultSchema = z.strictObject({
  layouts: z.array(officeLayoutDefinitionSchema),
  scene: officeSceneSchema.omit({ sceneId: true, actors: true, objects: true }).extend({
    actors: z.array(officeSceneSchema.shape.actors.element.omit({ position: true, presentation: true })),
    objects: z.array(officeSceneSchema.shape.objects.element.omit({ state: true, stateRevision: true })),
  }),
  ui: uiManifestSchema, chat: chatProtocolSchema, supportedMessages: z.array(z.string()),
  http: z.strictObject({ path: z.literal(relayPaths.messages), method: z.literal('POST'), authentication: z.literal('bearer'), requestBytes: z.number().int().positive(), businessTimeoutMs: z.number().int().positive() }),
  animation: z.strictObject({ requestSchema: jsonSchema, responseSchema: jsonSchema, delivery: z.literal('best-effort'), completionAcknowledged: z.literal(false) }),
  requests: jsonSchema, responses: z.strictObject({ envelope: jsonSchema, success: jsonSchema, error: jsonSchema,
    operations: z.array(z.strictObject({ type: z.string(), scope: z.enum(['operation', 'workspace', 'office']), codes: z.array(z.number().int()), dataSchema: jsonSchema })) }), rules: z.array(z.string()),
})
export const officeWorkspaceStateSchema = z.strictObject({ layout: officeLayoutStateSchema, chat: z.strictObject({ configured: z.boolean() }), offices: z.array(officeReadResultSchema).max(100) })
export const officeWorkspaceResultSchema = z.strictObject({ capabilities: officeCapabilitiesResultSchema, state: officeWorkspaceStateSchema })
export const officeSupportedMessages = ['offices.initialize', 'office.snapshot', 'office.read', 'office.capabilities', 'office.layout.read', 'office.layout.set', 'chat.updated', 'decision.request', 'ui.next', 'ui.respond'] as const
export { officeUiManifest }

const uiBase = { id: idSchema, teamId: idSchema, conversationId: idSchema }
export const officeUiActionSchema = z.discriminatedUnion('action', [
  z.strictObject({ ...uiBase, action: z.literal('conversation.delete') }),
  z.strictObject({ ...uiBase, action: z.literal('actor.inspect'), actorId: idSchema }),
  z.strictObject({ ...uiBase, action: z.literal('employee.inspect'), employeeId: z.string().min(1).max(100) }),
  ...(['task.start', 'task.block', 'task.complete'] as const).map(action => z.strictObject({ ...uiBase, action: z.literal(action), taskId: z.string().min(1).max(100) })),
  z.strictObject({ ...uiBase, action: z.literal('task.assign'), taskId: z.string().min(1).max(100), assigneeId: z.string().min(1).max(100) }),
  z.strictObject({ ...uiBase, action: z.literal('dialog.action'), interactionId: idSchema, optionId: idSchema }),
])
export type OfficeUiAction = z.infer<typeof officeUiActionSchema>
export const officeDialogSchema = z.strictObject({ template: z.literal('detail-v1'), title: text, description: z.string().max(4000).default(''),
  fields: z.array(z.strictObject({ label: z.string().max(100), value: z.string().max(2000) })).max(30).default([]),
  actions: z.array(z.strictObject({ id: idSchema, label: text })).max(8).default([]),
})
export const officeUiPresentationSchema = z.discriminatedUnion('target', [
  z.strictObject({ target: z.literal('result'), success: z.boolean(), message: z.string().max(4000).default('') }),
  z.strictObject({ target: z.literal('dialog'), content: officeDialogSchema }),
  z.strictObject({ target: z.literal('whiteboard'), snapshot: officeSnapshotSchema }),
])
export type OfficeUiPresentation = z.infer<typeof officeUiPresentationSchema>
export const officeUiNextResultSchema = z.strictObject({ actions: z.array(officeUiActionSchema).max(1) })
export const officeUiRespondResultSchema = z.strictObject({ interactionId: idSchema, delivered: z.literal(true) })
export function describeOfficeUi() {
  return { ...officeUiManifest, actionSchema: z.toJSONSchema(officeUiActionSchema, { io: 'input' }),
    presentationSchema: z.toJSONSchema(officeUiPresentationSchema, { io: 'input' }), whiteboardSchema: z.toJSONSchema(whiteboardTaskBoardSchema, { io: 'input' }) }
}
const decisionBase = { id: idSchema, actorId: optionalId, title: text, description: z.string().max(2000).default('') }
export const officeDecisionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...decisionBase, kind: z.literal('confirmation'), confirmLabel: text.default('确认'), rejectLabel: text.default('拒绝') }),
  z.strictObject({ ...decisionBase, kind: z.literal('choice'), options: z.array(z.strictObject({
    id: idSchema, label: text, description: z.string().max(500).default(''),
  })).min(2).max(8) }),
]).superRefine((decision, context) => {
  if (decision.kind === 'choice' && new Set(decision.options.map(option => option.id)).size !== decision.options.length) {
    context.addIssue({ code: 'custom', path: ['options'], message: '选项 ID 不得重复' })
  }
})

export const officeRequestSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('offices.initialize'), offices: z.array(officeSnapshotSchema).max(100), chat: officeChatConfigSchema.optional(), layoutId: officeLayoutIdSchema.optional() }).superRefine((request, context) => {
    if (request.offices.some(office => !idSchema.safeParse(office.workspace.id).success)) context.addIssue({ code: 'custom', path: ['offices'], message: '办公室 ID 无效' })
    if (new Set(request.offices.map(office => office.workspace.id)).size !== request.offices.length) {
      context.addIssue({ code: 'custom', path: ['offices'], message: '办公室 ID 不得重复' })
    }
  }),
  z.strictObject({ type: z.literal('office.snapshot'), teamId: idSchema, snapshot: officeSnapshotSchema }).superRefine((request, context) => {
    if (request.teamId !== request.snapshot.workspace.id) context.addIssue({ code: 'custom', path: ['teamId'], message: 'teamId 必须与 workspace.id 一致' })
  }),
  z.strictObject({ type: z.literal('office.read'), teamId: optionalId }),
  z.strictObject({ type: z.literal('office.capabilities') }),
  z.strictObject({ type: z.literal('office.layout.read') }),
  officeLayoutSetSchema,
  officeChatUpdatedSchema,
  z.strictObject({ type: z.literal('ui.next'), timeoutMs: z.number().int().min(1000).max(30000).default(30000) }),
  z.strictObject({ type: z.literal('ui.respond'), interactionId: idSchema, presentation: officeUiPresentationSchema }),
  z.strictObject({ type: z.literal('decision.request'), teamId: idSchema, conversationId: idSchema, decision: officeDecisionSchema,
    timeoutMs: z.number().int().min(1000).max(300000).default(60000) }),
])
export const officeMessageSchema = officeRequestSchema
export const officeDeliverySchema = z.strictObject({
  type: z.literal('office.request'), responseToken: idSchema, remainingMs: z.number().min(0).max(300000), request: officeRequestSchema,
})
export const officeClosedSchema = z.strictObject({
  type: z.literal('office.request.closed'), responseToken: idSchema,
})
export const officeSyncSchema = z.strictObject({
  type: z.literal('office.sync'), snapshot: officeSnapshotSchema,
})
export const officeSyncStartSchema = z.strictObject({
  type: z.literal('office.sync.start'), stateId: idSchema, layout: officeLayoutStateSchema,
})
export const officeSyncCompleteSchema = z.strictObject({
  type: z.literal('office.sync.complete'), offices: z.array(z.strictObject({ teamId: idSchema, seq: seqSchema })).max(100),
})
export const officeSuccessResultSchema = z.union([officeWorkspaceResultSchema, officeReadResultSchema, officeSnapshotResultSchema,
  officeDecisionResultSchema, officeCapabilitiesResultSchema, officeLayoutInfoSchema, officeChatUpdatedResultSchema, officeUiNextResultSchema, officeUiRespondResultSchema])
export const officeReplySchema = z.strictObject({ responseToken: idSchema, result: z.strictObject({
  code: z.union([z.literal(200), z.literal(400), z.literal(404), z.literal(409), z.literal(422), z.literal(500), z.literal(503)]),
  msg: z.string().max(500), data: z.union([officeWorkspaceReceiptSchema, officeRuntimeReceiptSchema, officeSnapshotResultSchema, officeDecisionResultSchema, officeLayoutInfoSchema, officeErrorResultSchema]),
}) })
export function officeResultSchema(type: OfficeRequest['type'], teamSpecific = false) {
  switch (type) {
    case 'offices.initialize': return officeWorkspaceResultSchema
    case 'office.snapshot': return officeSnapshotResultSchema
    case 'chat.updated': return officeChatUpdatedResultSchema
    case 'office.read': return teamSpecific ? officeReadResultSchema : officeWorkspaceResultSchema
    case 'office.capabilities': return officeCapabilitiesResultSchema
    case 'office.layout.read':
    case 'office.layout.set': return officeLayoutInfoSchema
    case 'decision.request': return officeDecisionResultSchema
    case 'ui.next': return officeUiNextResultSchema
    case 'ui.respond': return officeUiRespondResultSchema
  }
}
export function officeBrowserResultSchema(type: OfficeRequest['type'], teamSpecific = false) {
  switch (type) {
    case 'offices.initialize': return officeWorkspaceReceiptSchema
    case 'office.read': return teamSpecific ? officeRuntimeReceiptSchema : officeWorkspaceReceiptSchema
    case 'office.snapshot': return officeSnapshotResultSchema
    case 'decision.request': return officeDecisionResultSchema
    case 'office.layout.set': return officeLayoutInfoSchema
    default: throw new Error(`${type} is handled by the server, not the browser`)
  }
}
export function officeCapabilities(scene: z.infer<typeof officeSceneSchema>, options: { businessTimeoutMs?: number; chatTimeoutMs?: number } = {}) {
  return officeCapabilitiesResultSchema.parse({ layouts: layoutDefinitions,
    scene: { protocolVersion: scene.protocolVersion, command: scene.command, batch: scene.batch, capabilities: scene.capabilities,
      actors: scene.actors.map(({ id, name, templateId }) => ({ id, name, templateId })),
      objects: scene.objects.map(({ id, name, templateId, stateSchema, interactions }) => ({ id, name, templateId, stateSchema, interactions })) },
    ui: describeOfficeUi(), chat: describeChatProtocol(options.chatTimeoutMs), supportedMessages: [...officeSupportedMessages],
    http: { path: relayPaths.messages, method: 'POST', authentication: 'bearer', requestBytes: maxRelayMessageBytes, businessTimeoutMs: options.businessTimeoutMs ?? 10000 },
    animation: { requestSchema: z.toJSONSchema(relayMessageSchema, { io: 'input' }),
      responseSchema: z.toJSONSchema(z.strictObject({ code: z.literal(200), msg: z.string(), data: z.strictObject({ forwarded: z.number().int().positive() }) })),
      delivery: 'best-effort', completionAcknowledged: false },
    requests: z.toJSONSchema(officeRequestSchema, { io: 'input' }), responses: {
      envelope: z.toJSONSchema(responseEnvelopeSchema, { io: 'output' }), success: z.toJSONSchema(officeSuccessResultSchema, { io: 'output' }), error: z.toJSONSchema(officeErrorResultSchema, { io: 'output' }),
      operations: officeSupportedMessages.flatMap(type => (type === 'office.read' ? [false, true] : [false]).map(teamSpecific => ({ type,
        scope: type === 'office.read' ? teamSpecific ? 'office' : 'workspace' : 'operation',
        codes: ['offices.initialize', 'office.snapshot', 'office.layout.set', 'chat.updated'].includes(type) ? [200, 202] : [200],
        dataSchema: z.toJSONSchema(officeResultSchema(type, teamSpecific), { io: 'output' }),
      }))),
    }, rules: [
      '快照按办公室使用递增 seq；相同 seq 必须对应相同内容，旧 seq 不覆盖新状态。',
      '任务、成员、动态和白板按 conversationId 隔离；成员 sceneActorId 引用 scene.actors 的人物 ID，允许多个成员绑定同一人物。',
      '业务请求和响应的任何层级禁止 null，响应 data 固定为对象。',
      'layouts[].ui.slots 和 actions 描述该布局的展示能力与用户操作；localControls 是浏览器本地行为，不是远程命令。',
      '动画按需发送，完成不回执；业务任务的完成状态由外部后端通过快照提交。',
      'decision.request 在用户选择后返回；超时不默认批准，菜单关闭。',
      'responses.operations 的 dataSchema 校验响应 data；office.read 的 workspace 范围用于省略或清空 teamId，office 范围用于指定 teamId。',
      'runtime 是一个在线页面在处理请求时的采样，不保证所有页面选择相同会话；available 为 false 时只提供服务端业务快照。',
      '白板业务状态只通过完整 office.snapshot 更新；object.state.set 不用于办公室白板。',
      '物品 interactions 列出 furniture.use 可用的 interactionId 及固定允许的 actorIds，不保证当前空闲、路径可达或动作素材已加载。',
    ] })
}
export type OfficeRequest = z.infer<typeof officeRequestSchema>
export type OfficeMessage = z.infer<typeof officeMessageSchema>
export type OfficeDelivery = z.infer<typeof officeDeliverySchema>
export type OfficeReply = z.infer<typeof officeReplySchema>
