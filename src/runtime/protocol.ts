import { z } from 'zod'
import { idSchema, pointSchema } from './schema'
import { mapEditSchema } from './map/schema'

export { idSchema, pointSchema }
export const participantSchema = z.strictObject({ entityId: idSchema, role: idSchema })
export const placementSchema = z.strictObject({ entityId: idSchema, position: pointSchema })
const common = {
  protocolVersion: z.literal('2.0'),
  sceneId: idSchema,
  commandId: idSchema,
  after: z.array(idSchema).max(32).optional(),
  busyPolicy: z.enum(['queue', 'reject']).optional(),
  timeoutMs: z.number().int().min(100).max(3_600_000).optional(),
  expiresAt: z.iso.datetime().optional(),
}

export const commandSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...common, type: z.literal('map.edit'), edit: mapEditSchema }),
  z.strictObject({ ...common, type: z.literal('activity.start'), capability: idSchema,
    participants: z.array(participantSchema).max(24), params: z.record(z.string(), z.json()) }),
  z.strictObject({ ...common, type: z.literal('activity.stop'), activityId: idSchema }),
  z.strictObject({ ...common, type: z.literal('command.cancel'), targetCommandId: idSchema }),
  z.strictObject({ ...common, type: z.literal('actor.presentation.set'), actorId: idSchema,
    sourceRevision: z.number().int().nonnegative(), status: z.enum(['idle', 'working', 'thinking']),
    title: z.string().max(200) }),
  z.strictObject({ ...common, type: z.literal('object.state.set'), entityId: idSchema,
    expectedStateRevision: z.number().int().nonnegative(), state: z.record(z.string(), z.json()) }),
  z.strictObject({ ...common, type: z.literal('layout.apply'), expectedLayoutRevision: z.number().int().nonnegative(),
    placements: z.array(placementSchema).min(1).max(200) }),
])

export const batchSchema = z.strictObject({ mode: z.enum(['sequence', 'parallel']), commands: z.array(commandSchema).min(1).max(32) })
export type SceneCommand = z.infer<typeof commandSchema>
export type StartCommand = Extract<SceneCommand, { type: 'activity.start' }>
export type CommandBatch = z.infer<typeof batchSchema>
export type CommandStatus = 'queued' | 'running' | 'completed' | 'rejected' | 'failed' | 'cancelled' | 'expired'
export type SceneError = { code: string; message: string }
export type CommandRecord = {
  command: SceneCommand
  status: CommandStatus
  acceptedAt: number
  error?: SceneError
  activityId?: string
}
export type CommandResult = { commandId: string; status: CommandStatus; error?: SceneError; activityId?: string }
export const terminal = (status: CommandStatus) => !['queued', 'running'].includes(status)
export function protocolDescription() {
  return { protocolVersion: '2.0', unit: 'cell', coordinates: 'integer-cell-indices', command: z.toJSONSchema(commandSchema), batch: z.toJSONSchema(batchSchema),
    limits: { maxQueue: 128, maxHistory: 512, maxBatch: 32, maxMessageBytes: 65536 },
    delivery: 'bounded-local-deduplication', extensions: ['builtin-plugins', 'activity-lifecycle', 'layout-editing', 'integer-grid-v2', 'furniture-interactions'] }
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

export class SceneFault extends Error {
  readonly code: string
  constructor(code: string, message: string) { super(message); this.code = code }
}
export function sceneError(error: unknown): SceneError {
  return error instanceof SceneFault ? { code: error.code, message: error.message }
    : { code: 'PLUGIN_ERROR', message: error instanceof Error ? error.message : 'Unknown failure' }
}
