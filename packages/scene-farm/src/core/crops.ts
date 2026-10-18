import { z } from 'zod'

export const cropIdSchema = z.enum(['carrot', 'tomato', 'cabbage'])
export type CropId = z.infer<typeof cropIdSchema>
export const crops = {
  carrot: { name: '胡萝卜', growthMs: 24000, yield: 3, color: 0xe99649 },
  tomato: { name: '番茄', growthMs: 32000, yield: 4, color: 0xdf7166 },
  cabbage: { name: '卷心菜', growthMs: 40000, yield: 2, color: 0x76a778 },
} as const
export const plotStateSchema = z.strictObject({
  crop: z.union([cropIdSchema, z.literal('')]).default(''),
  plantedAt: z.union([z.literal(-1), z.number().nonnegative()]).default(-1),
  wateredAt: z.union([z.literal(-1), z.number().nonnegative()]).default(-1),
}).superRefine((state, ctx) => {
  if ((state.crop === '') !== (state.plantedAt === -1) || state.crop === '' && state.wateredAt !== -1 || state.wateredAt >= 0 && state.wateredAt < state.plantedAt) ctx.addIssue({ code: 'custom', message: '菜地种植时间不一致' })
})
export type PlotState = z.infer<typeof plotStateSchema>
export const emptyPlot = (): PlotState => ({ crop: '', plantedAt: -1, wateredAt: -1 })
export const inventoryStateSchema = z.strictObject({ carrot: z.number().int().nonnegative(), tomato: z.number().int().nonnegative(), cabbage: z.number().int().nonnegative() })
export function cropStatus(raw: Record<string, unknown>, now: number) {
  const state = plotStateSchema.parse(raw)
  const progress = state.crop && state.wateredAt >= 0 ? Math.min(1, Math.max(0, now - state.wateredAt) / crops[state.crop].growthMs) : 0
  const stage = state.crop === '' ? 'empty' : state.wateredAt === -1 ? 'thirsty' : progress >= 1 ? 'ready' : progress >= .45 ? 'growing' : 'seedling'
  return { ...state, progress, stage, label: { empty: '待播种', thirsty: '需要浇水', seedling: '幼苗', growing: '生长中', ready: '可以采收' }[stage] }
}

/** Host-owned simulation time; offline time and animation frame counts do not advance crops. */
export function createFarmClock(initialMs = 0) {
  let elapsed = Math.max(0, Number.isFinite(initialMs) ? initialMs : 0), speed = 1
  return {
    now: () => elapsed,
    advance(ms: number) { if (Number.isFinite(ms) && ms > 0) elapsed += Math.min(ms, 1000) * speed },
    setSpeed(value: number) { if (![0, 1, 4].includes(value)) throw new Error('Unsupported farm speed'); speed = value },
    get speed() { return speed },
  }
}
export type FarmClock = ReturnType<typeof createFarmClock>
