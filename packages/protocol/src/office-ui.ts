import { z } from 'zod'
import { idSchema } from './schema.ts'

export const whiteboardTaskBoardSchema = z.strictObject({
  template: z.literal('task-board-v1').default('task-board-v1'), title: z.string().max(160).default(''),
  status: z.enum(['queued', 'running', 'blocked', 'completed', 'failed']).default('queued'),
  tagline: z.string().max(40).default(''), description: z.string().max(300).default(''), note: z.string().max(160).default(''),
  link: z.strictObject({ label: z.string().max(40).default(''), url: z.union([z.literal(''), z.url().refine(value => {
    try { return ['http:', 'https:'].includes(new URL(value).protocol) } catch { return false }
  })]).default('') }).default({ label: '', url: '' }),
  steps: z.array(z.strictObject({ id: idSchema, title: z.string().min(1).max(160), progress: z.union([z.literal(-1), z.number().min(0).max(100)]).default(-1) })).max(3).default([]),
})
type WhiteboardInput = z.input<typeof whiteboardTaskBoardSchema>
export type WhiteboardTaskBoardData = WhiteboardInput & Required<Pick<WhiteboardInput, 'template' | 'title' | 'status' | 'steps'>>
export const emptyWhiteboard = () => whiteboardTaskBoardSchema.parse({ template: 'task-board-v1', title: '', status: 'queued', tagline: '', steps: [] })

export const officeUiManifest = {
  slots: [
    { id: 'whiteboard', content: 'task-board-v1', persistent: true, update: 'office.snapshot' },
    { id: 'dialog', content: 'detail-v1', persistent: false, update: 'ui.respond' },
    { id: 'computer.task', content: 'task', persistent: true, update: 'office.snapshot' },
    { id: 'decision', content: 'confirmation-or-choice', persistent: false, update: 'decision.request' },
  ],
  actions: ['actor.inspect', 'employee.inspect', 'task.start', 'task.block', 'task.complete', 'task.assign', 'dialog.action', 'conversation.delete'],
} as const
