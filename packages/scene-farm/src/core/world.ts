import type { ScenePlugin, World } from '@pixoffice/runtime'
import { emptyPlot, inventoryStateSchema, plotStateSchema } from './crops.ts'

export const farmRoster = [
  { id: 'farmer-1', name: '小禾', appearanceId: 'farm-gardener', role: 'farmer' },
  { id: 'farmer-2', name: '阿苗', appearanceId: 'farm-gardener', role: 'farmer' },
] as const
export const farmObjects: ScenePlugin = {
  id: 'farm.objects', name: '农场物品', version: '1.0.0', apiVersion: 1,
  templates: [
    { id: 'farm.plot', name: '菜地', view: 'farm.plot', footprint: { left: 0, top: 0, right: 5, bottom: 3 },
      anchors: { work: { x: 2, y: 3 } }, resources: { cultivation: 1 } },
    { id: 'farm.store', name: '收获箱', view: 'farm.store', footprint: { left: 0, top: 0, right: 2, bottom: 1 },
      anchors: { front: { x: 0, y: 1 } }, resources: { inventory: 1 } },
  ],
  stateSchemas: { 'farm.plot': plotStateSchema, 'farm.store': inventoryStateSchema },
}
export function createFarmWorld(sceneId = 'farm'): World {
  const positions = [{ x: 3, y: 5 }, { x: 10, y: 5 }, { x: 17, y: 5 }, { x: 3, y: 10 }, { x: 10, y: 10 }, { x: 17, y: 10 }]
  return { sceneId, unit: 'cell', width: 24, height: 18, gridSize: 1, layoutRevision: 0,
    bounds: { left: 2, top: 4, right: 22, bottom: 16 },
    actors: farmRoster.map((person, i) => ({ id: person.id, name: person.name, templateId: person.appearanceId, color: 0x709c82,
      position: { x: 8 + i * 5, y: 14 }, facing: 'front', posture: 'standing', presentation: { status: 'idle', title: '', sourceRevision: 0 } })),
    props: [
      ...positions.map((position, i) => ({ id: `plot-${i + 1}`, name: `${i + 1} 号菜地`, templateId: 'farm.plot', position, state: emptyPlot(), stateRevision: 0 })),
      { id: 'harvest-store', name: '收获箱', templateId: 'farm.store', position: { x: 20, y: 14 }, state: { carrot: 0, tomato: 0, cabbage: 0 }, stateRevision: 0 },
    ],
  }
}
