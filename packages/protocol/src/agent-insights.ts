import { z } from 'zod'

const label = z.string().min(1).max(80)
const value = z.union([z.literal(-1), z.number().finite().nonnegative()])
const item = z.strictObject({ label, value: z.number().finite().nonnegative() })
const base = { id: z.string().min(1).max(80), title: label }
export const agentInsightBlockSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...base, type: z.literal('trend'), unit: z.string().max(12).default(''), points: z.array(item).min(1).max(31) }),
  z.strictObject({ ...base, type: z.literal('bars'), unit: z.string().max(12).default(''), items: z.array(item).min(1).max(8) }),
  z.strictObject({ ...base, type: z.literal('distribution'), items: z.array(item).min(1).max(6) }),
  z.strictObject({ ...base, type: z.literal('activity'), items: z.array(z.strictObject({
    label: z.string().min(1).max(160), occurredAt: z.iso.datetime({ offset: true }),
    status: z.enum(['completed', 'running', 'blocked', 'failed']),
  })).max(5) }),
])
export const agentInsightsSchema = z.strictObject({
  scope: z.enum(['conversation', 'office']), updatedAt: z.iso.datetime({ offset: true }),
  periods: z.array(z.strictObject({ id: z.enum(['last7Days', 'last30Days']), label,
    metrics: z.array(z.strictObject({ id: z.string().min(1).max(80), label, value, unit: z.string().max(12).default(''),
      changePercent: z.number().finite().min(-100).max(10000).optional(),
      sentiment: z.enum(['positive', 'negative', 'neutral']).default('neutral'),
    })).max(4), blocks: z.array(agentInsightBlockSchema).max(4),
  })).min(1).max(2),
}).superRefine((insights, context) => {
  if (new Set(insights.periods.map(period => period.id)).size !== insights.periods.length) context.addIssue({ code: 'custom', path: ['periods'], message: '统计时间范围重复' })
  insights.periods.forEach((period, index) => {
    for (const field of ['metrics', 'blocks'] as const) if (new Set(period[field].map(item => item.id)).size !== period[field].length) {
      context.addIssue({ code: 'custom', path: ['periods', index, field], message: '统计项目 ID 重复' })
    }
  })
})
export type AgentInsights = z.input<typeof agentInsightsSchema>
export type AgentInsightBlock = z.input<typeof agentInsightBlockSchema>
