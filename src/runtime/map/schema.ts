import { z } from 'zod'
import { blockedAreaSchema as baseBlockedAreaSchema, boxSchema, idSchema, pointSchema as basePointSchema } from '../schema'

// Drafts may leave the room while being edited, but must remain safe to render.
const pointSchema = basePointSchema.refine(p => Math.abs(p.x) <= 8192 && Math.abs(p.y) <= 8192, '坐标超出编辑范围')
const blockedAreaSchema = baseBlockedAreaSchema.refine(area => Object.values(area.bounds).every(n => Math.abs(n) <= 8192), '区域超出编辑范围')

export const mapPropSchema = z.strictObject({ id: idSchema, name: z.string().min(1).max(100), templateId: idSchema, position: pointSchema,
  anchors: z.record(idSchema, pointSchema).optional() })
export const mapDocumentSchema = z.strictObject({ format: z.literal('ai-office-map'), version: z.literal(2), unit: z.literal('cell'), sceneId: idSchema,
  width: z.number().int().min(1).max(128), height: z.number().int().min(1).max(128), gridSize: z.literal(1), bounds: boxSchema,
  walkableArea: z.array(pointSchema).min(3).max(16), blockedAreas: z.array(blockedAreaSchema).max(64),
  props: z.array(mapPropSchema).max(200), bindings: z.array(z.strictObject({ actorId: idSchema, homeId: idSchema.nullable(), position: pointSchema })).max(100) })
export const mapOperationSchema = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('prop.put'), prop: mapPropSchema }),
  z.strictObject({ op: z.literal('prop.remove'), id: idSchema }),
  z.strictObject({ op: z.literal('floor.set'), points: z.array(pointSchema).min(3).max(16) }),
  z.strictObject({ op: z.literal('blocked.put'), area: blockedAreaSchema }),
  z.strictObject({ op: z.literal('blocked.remove'), id: idSchema }),
  z.strictObject({ op: z.literal('binding.set'), actorId: idSchema, homeId: idSchema.nullable(), position: pointSchema.optional() }),
  z.strictObject({ op: z.literal('map.replace'), document: mapDocumentSchema }),
])
const draftRef = { draftId: idSchema, expectedDraftRevision: z.number().int().nonnegative() }
export const mapEditSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('begin'), expectedLayoutRevision: z.number().int().nonnegative() }),
  z.strictObject({ ...draftRef, action: z.literal('patch'), operations: z.array(mapOperationSchema).min(1).max(64), requireValid: z.boolean().optional() }),
  z.strictObject({ ...draftRef, action: z.literal('undo') }),
  z.strictObject({ ...draftRef, action: z.literal('redo') }),
  z.strictObject({ ...draftRef, action: z.literal('validate') }),
  z.strictObject({ ...draftRef, action: z.literal('route'), from: pointSchema, to: pointSchema }),
  z.strictObject({ ...draftRef, action: z.literal('commit') }),
  z.strictObject({ ...draftRef, action: z.literal('cancel') }),
])
export type MapDocument = z.infer<typeof mapDocumentSchema>
export type MapOperation = z.infer<typeof mapOperationSchema>
export type MapEdit = z.infer<typeof mapEditSchema>
