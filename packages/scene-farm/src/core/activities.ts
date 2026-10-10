import { z } from 'zod'
import { SceneFault } from '@pixoffice/runtime'
import type { Capability, ObjectStateChange, PluginContext, ScenePlugin } from '@pixoffice/runtime'
import { cropIdSchema, crops, cropStatus, emptyPlot, inventoryStateSchema, plotStateSchema } from './crops.ts'

const paramsSchema = z.strictObject({ plotId: z.string().min(1).max(100), crop: cropIdSchema.optional() })
type Operation = 'plant' | 'water' | 'harvest'
const labels = { plant: '播种', water: '浇水', harvest: '采收' }
function operationState(context: PluginContext, raw: unknown, operation: Operation, now: number) {
  const params = paramsSchema.parse(raw), participant = context.participants[0]
  const actor = context.world.actors.find(a => a.id === participant?.entityId)
  if (context.participants.length !== 1 || participant?.role !== 'farmer' || !actor) throw new SceneFault('INVALID_PARTICIPANTS', '农作需要一位农夫')
  const plot = context.world.props.find(p => p.id === params.plotId && p.templateId === 'farm.plot')
  if (!plot) throw new SceneFault('ENTITY_NOT_FOUND', params.plotId)
  const state = cropStatus(plot.state, now)
  if (operation === 'plant' && (state.crop || !params.crop)) throw new SceneFault('INVALID_PARAMS', '只有空地可以播种，且需要选择蔬菜')
  if (operation === 'water' && state.stage !== 'thirsty') throw new SceneFault('INVALID_PARAMS', '这块菜地不需要浇水')
  if (operation === 'harvest' && state.stage !== 'ready') throw new SceneFault('INVALID_PARAMS', '作物尚未成熟')
  return { params, actor, plot, state }
}
export function createFarmActivities(now: () => number): ScenePlugin {
  const capabilities: Capability[] = (['plant', 'water', 'harvest'] as const).map(operation => ({
    id: `farm.${operation}`, name: labels[operation], params: paramsSchema,
    build(context, raw) {
      const { actor, plot } = operationState(context, raw, operation, now())
      return { title: `${actor.name}${labels[operation]}${plot.name}`,
        claims: [{ resource: `actor:${actor.id}:body`, units: 1 }, { resource: `prop:${plot.id}:cultivation`, units: 1 },
          ...(operation === 'harvest' ? [{ resource: 'prop:harvest-store:inventory', units: 1 }] : [])],
        phases: [
          { title: `前往${plot.name}`, moves: [{ actorId: actor.id, targetId: plot.id, anchor: 'work' }] },
          { title: `${labels[operation]}${plot.name}`, durationMs: 1800, poses: [{ actorId: actor.id, posture: 'standing', facing: 'back' }], actions: [{ actorId: actor.id, actionId: `farm.${operation}` }] },
        ],
      }
    },
    complete(context, raw): ObjectStateChange[] {
      const { plot, state, params } = operationState(context, raw, operation, now())
      const next = operation === 'plant' ? { crop: params.crop!, plantedAt: now(), wateredAt: null }
        : operation === 'water' ? { ...plotStateSchema.parse(plot.state), wateredAt: now() } : emptyPlot()
      const changes: ObjectStateChange[] = [{ entityId: plot.id, expectedStateRevision: plot.stateRevision, state: next }]
      if (operation === 'harvest') {
        const store = context.world.props.find(p => p.id === 'harvest-store' && p.templateId === 'farm.store')
        if (!store) throw new SceneFault('ENTITY_NOT_FOUND', 'harvest-store')
        const inventory = inventoryStateSchema.parse(store.state), crop = state.crop!
        changes.push({ entityId: store.id, expectedStateRevision: store.stateRevision, state: { ...inventory, [crop]: inventory[crop] + crops[crop].yield } })
      }
      return changes
    },
  }))
  return { id: 'farm.cultivation', name: '种植与照料', version: '1.0.0', apiVersion: 1, dependencies: ['farm.objects'], capabilities }
}
