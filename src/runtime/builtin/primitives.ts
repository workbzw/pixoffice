import { z } from 'zod'
import type { PluginContext, ScenePlugin } from '../plugins'
import { idSchema, SceneFault } from '../protocol'

const moveParams = z.strictObject({ targetId: idSchema, anchor: idSchema })
const sayParams = z.strictObject({ text: z.string().min(1).max(500), durationMs: z.number().int().min(300).max(30000).default(3000) })
function actorId(context: PluginContext) {
  if (context.participants.length !== 1 || context.participants[0].role !== 'actor') throw new SceneFault('INVALID_PARTICIPANTS', '需要一位 actor')
  return context.participants[0].entityId
}

export const scenePrimitives: ScenePlugin = {
  id: 'scene.primitives', name: '通用移动与发言', version: '1.0.0', apiVersion: 1,
  capabilities: [
    { id: 'scene.move', name: '前往锚点', params: moveParams, build(context, raw) {
      const id = actorId(context), params = moveParams.parse(raw)
      return { title: '前往目标', claims: [{ resource: `actor:${id}:body`, units: 1 }], phases: [{ title: '行走', moves: [{ actorId: id, ...params }] }] }
    } },
    { id: 'scene.say', name: '发言', params: sayParams, build(context, raw) {
      const id = actorId(context), params = sayParams.parse(raw)
      return { title: '发言', claims: [{ resource: `actor:${id}:speech`, units: 1 }], phases: [{ title: '发言', durationMs: params.durationMs, speech: [{ actorId: id, text: params.text }] }] }
    } },
  ],
}
