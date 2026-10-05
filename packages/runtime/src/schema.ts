import { z } from 'zod'

export const idSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_.:-]+$/)
export const pointSchema = z.strictObject({ x: z.number().int(), y: z.number().int() })
export const boxSchema = z.strictObject({ left: z.number().int(), top: z.number().int(), right: z.number().int(), bottom: z.number().int() })
  .refine(b => b.left < b.right && b.top < b.bottom, '区域宽高必须大于 0')
export const blockedAreaSchema = z.strictObject({ id: idSchema, name: z.string().min(1).max(100), bounds: boxSchema })
