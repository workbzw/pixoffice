import { z } from 'zod'
import { batchSchema, commandSchema, idSchema } from './index.ts'

export const relayPaths = {
  messages: '/api/pixoffice/messages',
  events: '/api/pixoffice/events',
} as const
export const maxRelayMessageBytes = 65_536
export const maxRelayEventBytes = 524_288
export const maxRelayTeams = 100

// A delivery envelope around existing scene commands, not a new business protocol.
export const relayMessageSchema = z.strictObject({
  teamId: idSchema, command: z.union([commandSchema, batchSchema]),
}).superRefine((message, context) => {
  const payload = message.command
  const commands = 'commands' in payload ? payload.commands : [payload]
  if (commands.some(command => command.sceneId !== message.teamId)) {
    context.addIssue({ code: 'custom', path: ['teamId'], message: 'teamId must match every command sceneId' })
  }
  if (new Set(commands.map(command => command.commandId)).size !== commands.length) {
    context.addIssue({ code: 'custom', path: ['command'], message: 'Duplicate command IDs in batch' })
  }
})
export type RelayMessage = z.infer<typeof relayMessageSchema>
