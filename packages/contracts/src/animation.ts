import { z } from 'zod'

const id = z.string().min(1).max(200)
const point = z.strictObject({ x: z.number().finite(), y: z.number().finite() })
export const viewDirectionSchema = z.enum(['front', 'back', 'left', 'right'])
export type ViewDirection = z.infer<typeof viewDirectionSchema>
export type PointDu = z.infer<typeof point>
export type BoundsDu = { left: number; top: number; right: number; bottom: number }
export const actionClockSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('time'), elapsedMs: z.number().finite().nonnegative(), loop: z.boolean() }),
  z.strictObject({ mode: z.literal('progress'), progress: z.number().min(0).max(1) }),
  z.strictObject({ mode: z.literal('distance'), travelledDu: z.number().finite().nonnegative(), strideDu: z.number().finite().positive() }),
])
export type ActionClock = z.infer<typeof actionClockSchema>
export const visualRequestSchema = z.strictObject({
  poseId: id, view: viewDirectionSchema, variantIds: z.array(id).min(1).max(8), contactProfileId: id.optional(),
}).refine(value => new Set(value.variantIds).size === value.variantIds.length, 'Duplicate action variants')
export type VisualRequest = z.infer<typeof visualRequestSchema>
export const entityPresentationSchema = z.strictObject({
  entityId: id, request: visualRequestSchema,
  actions: z.array(z.strictObject({ instanceId: id, variantId: id, clock: actionClockSchema })).min(1).max(8),
  contacts: z.array(z.strictObject({ socketId: id, position: point, toleranceDu: z.number().finite().nonnegative() })).max(32),
}).refine(value => value.actions.length === value.request.variantIds.length &&
  new Set(value.actions.map(action => action.variantId)).size === value.actions.length &&
  value.actions.every(action => value.request.variantIds.includes(action.variantId)) &&
  new Set(value.actions.map(action => action.instanceId)).size === value.actions.length, 'Actions must match request variants')
export type EntityPresentation = z.infer<typeof entityPresentationSchema>
export type ActionSample = EntityPresentation['actions'][number]
export type ContactTarget = EntityPresentation['contacts'][number]
export type SupportResult = { supported: true } | { supported: false; missing: string[] }
export interface ActionVariant {
  variantId: string; actionId: string; poseId: string; view: ViewDirection
  channel: 'base' | 'gesture' | 'speech'
  clockModes: ActionClock['mode'][]
}
export interface VisualAssetManifest {
  schemaVersion: 1; asset: { id: string; revision: string }; adapterId: string; adapterApiVersion: 1
  rendererApiVersion: 'pixi-1'; presentationProfileId: string
  capabilities: { variants: ActionVariant[]; combinations: string[][]; contactProfiles: string[]; sockets: { id: string; policy: 'stable' | 'animated' }[] }
  source: { format: string; uri: string }
}
export const visualAssetManifestSchema = z.strictObject({
  schemaVersion: z.literal(1), asset: z.strictObject({ id, revision: id }),
  adapterId: id, adapterApiVersion: z.literal(1), rendererApiVersion: z.literal('pixi-1'), presentationProfileId: id,
  capabilities: z.strictObject({
    variants: z.array(z.strictObject({
      variantId: id, actionId: id, poseId: id, view: viewDirectionSchema,
      channel: z.enum(['base', 'gesture', 'speech']), clockModes: z.array(z.enum(['time', 'progress', 'distance'])).min(1),
    })),
    combinations: z.array(z.array(id).min(1).max(8)), contactProfiles: z.array(id),
    sockets: z.array(z.strictObject({ id, policy: z.enum(['stable', 'animated']) })),
  }),
  source: z.object({ format: id, uri: z.string().min(1) }).passthrough(),
}).superRefine(({ capabilities }, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message })
  const unique = (items: string[]) => new Set(items).size === items.length
  if (!unique(capabilities.variants.map(v => v.variantId))) fail('Duplicate action variants')
  if (!unique(capabilities.sockets.map(s => s.id))) fail('Duplicate sockets')
  if (!unique(capabilities.contactProfiles)) fail('Duplicate contact profiles')
  for (const variant of capabilities.variants) if (!unique(variant.clockModes)) fail('Duplicate clock modes')
  for (const combination of capabilities.combinations) {
    const variants = combination.map(id => capabilities.variants.find(v => v.variantId === id))
    if (!unique(combination) || variants.some(v => !v)) fail('Invalid action combination')
    else if (variants.some(v => v!.poseId !== variants[0]!.poseId || v!.view !== variants[0]!.view)) fail('Combination pose and view must agree')
  }
})
export interface VisualCue { actionInstanceId: string; markerId: string; cycle: number }
export interface AnimatedVisual<TNode> {
  readonly root: TNode
  sample(state: EntityPresentation): readonly VisualCue[]
  getSocket(id: string): PointDu | undefined
  getHitBounds(): BoundsDu
  dispose(): void
}
export interface VisualAssetLease<TNode> {
  readonly manifest: VisualAssetManifest
  assess(request: VisualRequest): SupportResult
  prepare(requests: readonly VisualRequest[], signal: AbortSignal): Promise<void>
  create(initial: EntityPresentation): AnimatedVisual<TNode>
  release(): void
}
export interface AnimationAdapter<TNode> {
  readonly id: string
  readonly apiVersion: 1
  readonly rendererApiVersion: 'pixi-1'
  acquire(manifest: VisualAssetManifest, signal: AbortSignal): Promise<VisualAssetLease<TNode>>
}
