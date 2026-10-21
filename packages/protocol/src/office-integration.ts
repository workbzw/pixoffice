import { z } from 'zod'
import { idSchema, jsonObjectSchema } from './schema.ts'
import { dashboardSnapshotSchema, validateDashboardSnapshot } from './dashboard.ts'
import { whiteboardTaskBoardSchema, officeUiManifest, emptyWhiteboard } from './office-ui.ts'
import { officeChatConfigSchema } from './chat.ts'

export const officeIntegrationPaths = { reply: '/api/pixoffice/reply', ui: '/api/pixoffice/ui' } as const
// Internal SSE subscription topic for the complete office workspace.
export const officeWorkspaceTopic = '@pixoffice/workspace'
const text = z.string().min(1).max(160)
const employeeSchema = dashboardSnapshotSchema.shape.employees.element
const taskSchema = dashboardSnapshotSchema.shape.tasks.element
const eventSchema = dashboardSnapshotSchema.shape.events.element
export const seqSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
const optionalId = z.union([idSchema, z.literal('')]).default('')
const unknownPercent = z.union([z.literal(-1), z.number().min(0).max(100)]).default(-1)
export const officeSnapshotSchema = z.strictObject({ ...dashboardSnapshotSchema.shape, seq: seqSchema,
  employees: z.array(employeeSchema.safeExtend({ sceneActorId: employeeSchema.shape.sceneActorId.default(''),
    role: z.string().max(80).default(''), online: z.boolean().default(false) })).max(200).default([]),
  tasks: z.array(taskSchema.safeExtend({ assigneeId: taskSchema.shape.assigneeId.default(''), progress: unknownPercent,
    summary: z.string().max(1000).default('') })).max(1000).default([]),
  events: z.array(eventSchema.safeExtend({
    taskId: eventSchema.shape.taskId.default(''), employeeId: eventSchema.shape.employeeId.default(''), fromEmployeeId: eventSchema.shape.fromEmployeeId.default(''),
  })).max(500).default([]),
  system: z.strictObject({ cpuPercent: unknownPercent, memoryPercent: unknownPercent,
    networkKbps: z.union([z.literal(-1), z.number().nonnegative()]).default(-1) }).default({ cpuPercent: -1, memoryPercent: -1, networkKbps: -1 }),
  whiteboard: whiteboardTaskBoardSchema.default(emptyWhiteboard),
}).superRefine(validateDashboardSnapshot)
export type OfficeSnapshot = z.infer<typeof officeSnapshotSchema>
export const officeReasonSchema = z.enum(['INVALID_MESSAGE', 'INVALID_REPLY', 'OFFICE_NOT_INITIALIZED', 'ACTOR_NOT_FOUND', 'INVALID_BINDING',
  'OFFICE_LIMIT', 'CACHE_FULL', 'STALE_SEQ', 'DUPLICATE_SEQ', 'SEQ_CONFLICT', 'REQUEST_TIMEOUT', 'NO_RECEIVER', 'RECEIVER_UNAVAILABLE',
  'BUSINESS_QUEUE_FULL', 'DECISION_DUPLICATE', 'DECISION_EXPIRED', 'DECISION_QUEUE_FULL', 'SERVER_CLOSING', 'CALLER_DISCONNECTED',
  'SCENE_SYNC_FAILED', 'BUSINESS_ERROR', 'UI_REQUEST_EXPIRED', 'UI_QUEUE_FULL', 'UI_WAIT_BUSY', 'UNSUPPORTED_UI_ACTION', 'SNAPSHOT_REQUIRED',
  'AUTH_FAILED', 'FORBIDDEN', 'NOT_FOUND', 'MESSAGE_TOO_LARGE', 'INTERNAL_ERROR', 'REQUEST_CLOSED',
  'CHAT_NOT_CONFIGURED', 'CHAT_UPSTREAM_ERROR', 'CHAT_TIMEOUT'])
export const officeErrorResultSchema = z.strictObject({ reasonCode: officeReasonSchema, details: jsonObjectSchema.default({}),
  issues: z.array(jsonObjectSchema).default([]) })

const jsonSchema = jsonObjectSchema
export const participantRulesSchema = z.strictObject({ min: z.number().int().nonnegative(), max: z.number().int().min(-1),
  roles: z.array(z.strictObject({ role: idSchema, min: z.number().int().nonnegative(), max: z.number().int().nonnegative() })), rules: z.array(z.string()) })
export const officeSceneSchema = z.strictObject({
  protocolVersion: z.literal('2.0'), sceneId: idSchema, command: jsonSchema, batch: jsonSchema,
  actors: z.array(z.strictObject({ id: idSchema, name: z.string(), templateId: idSchema, position: z.strictObject({ x: z.number().int(), y: z.number().int() }),
    presentation: z.strictObject({ status: z.enum(['idle', 'working', 'thinking']), title: z.string(), sourceRevision: z.number().int().nonnegative() }) })),
  objects: z.array(z.strictObject({ id: idSchema, name: z.string(), templateId: idSchema, state: jsonSchema, stateRevision: z.number().int().nonnegative(), stateSchema: jsonSchema.default({}) })),
  capabilities: z.array(z.strictObject({ id: idSchema, name: z.string(), params: jsonSchema,
    participants: participantRulesSchema.default({ min: 0, max: -1, roles: [], rules: [] }) })),
})
const uiManifestSchema = z.strictObject({ slots: z.array(z.strictObject({ id: z.string(), content: z.string(), persistent: z.boolean(), update: z.string() })), actions: z.array(z.string()),
  actionSchema: jsonSchema, presentationSchema: jsonSchema, whiteboardSchema: jsonSchema })
export const officeWorkspaceResultSchema = z.strictObject({
  offices: z.array(z.strictObject({ id: idSchema, name: z.string(), seq: seqSchema, runtimeReady: z.boolean(), taskCount: z.number().int().nonnegative() })),
  actors: z.array(z.strictObject({ id: idSchema, name: z.string() })), supportedMessages: z.array(z.string()), sceneCommandProtocol: z.literal('2.0'), ui: uiManifestSchema,
})
export const officeReadResultSchema = z.strictObject({ snapshot: officeSnapshotSchema, scene: officeSceneSchema, pendingDecisions: z.array(idSchema) })
export const officeSnapshotResultSchema = z.strictObject({ teamId: idSchema, seq: seqSchema, status: z.enum(['applied', 'cached', 'ignored']), reasonCode: z.enum(['STALE_SEQ', 'DUPLICATE_SEQ']).optional() })
export const officeDecisionResultSchema = z.strictObject({ teamId: idSchema, decisionId: idSchema, choiceId: idSchema, label: text })
export const officeCapabilitiesResultSchema = z.strictObject({ scene: officeSceneSchema, ui: uiManifestSchema, requests: jsonSchema, responses: z.strictObject({ success: jsonSchema, error: jsonSchema }) })
export const officeSupportedMessages = ['offices.initialize', 'office.snapshot', 'office.read', 'office.capabilities', 'decision.request', 'ui.next', 'ui.respond'] as const
export { officeUiManifest }

const uiBase = { id: idSchema, teamId: idSchema }
export const officeUiActionSchema = z.discriminatedUnion('action', [
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
  z.strictObject({ type: z.literal('offices.initialize'), offices: z.array(officeSnapshotSchema).max(100), chat: officeChatConfigSchema.optional() }).superRefine((request, context) => {
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
  z.strictObject({ type: z.literal('ui.next'), timeoutMs: z.number().int().min(1000).max(30000).default(30000) }),
  z.strictObject({ type: z.literal('ui.respond'), interactionId: idSchema, presentation: officeUiPresentationSchema }),
  z.strictObject({ type: z.literal('decision.request'), teamId: idSchema, decision: officeDecisionSchema,
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
  type: z.literal('office.sync.start'), stateId: idSchema,
})
export const officeSyncCompleteSchema = z.strictObject({
  type: z.literal('office.sync.complete'), offices: z.array(z.strictObject({ teamId: idSchema, seq: seqSchema })).max(100),
})
export const officeSuccessResultSchema = z.union([officeWorkspaceResultSchema, officeReadResultSchema, officeSnapshotResultSchema,
  officeDecisionResultSchema, officeCapabilitiesResultSchema, officeUiNextResultSchema, officeUiRespondResultSchema])
export const officeReplySchema = z.strictObject({ responseToken: idSchema, result: z.strictObject({
  code: z.union([z.literal(200), z.literal(400), z.literal(404), z.literal(409), z.literal(422), z.literal(500), z.literal(503)]),
  msg: z.string().max(500), data: z.union([officeSuccessResultSchema, officeErrorResultSchema]),
}) })
export function officeResultSchema(type: OfficeRequest['type'], teamSpecific = false) {
  switch (type) {
    case 'offices.initialize': return officeWorkspaceResultSchema
    case 'office.snapshot': return officeSnapshotResultSchema
    case 'office.read': return teamSpecific ? officeReadResultSchema : officeWorkspaceResultSchema
    case 'office.capabilities': return officeCapabilitiesResultSchema
    case 'decision.request': return officeDecisionResultSchema
    case 'ui.next': return officeUiNextResultSchema
    case 'ui.respond': return officeUiRespondResultSchema
  }
}
export function officeCapabilities(scene: z.infer<typeof officeSceneSchema>) {
  return officeCapabilitiesResultSchema.parse({ scene, ui: describeOfficeUi(),
    requests: z.toJSONSchema(officeRequestSchema, { io: 'input' }), responses: {
      success: z.toJSONSchema(officeSuccessResultSchema, { io: 'output' }), error: z.toJSONSchema(officeErrorResultSchema, { io: 'output' }),
    } })
}
export type OfficeRequest = z.infer<typeof officeRequestSchema>
export type OfficeMessage = z.infer<typeof officeMessageSchema>
export type OfficeDelivery = z.infer<typeof officeDeliverySchema>
export type OfficeReply = z.infer<typeof officeReplySchema>
