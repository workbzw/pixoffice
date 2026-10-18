import { z } from 'zod'
import { scenePrimitives } from '@pixoffice/runtime'
import type { ScenePack } from '@pixoffice/runtime'
import { SceneFault } from '@pixoffice/protocol'

export const mapSize = 10
export const dimetricScene: ScenePack = {
  manifest: { id: 'pixoffice.dimetric-lab', version: '1.0.0', apiVersion: 1 },
  plugins: [scenePrimitives, {
    id: 'dimetric.lab', name: '轴测装配', version: '1.0.0', apiVersion: 1,
    templates: [
      { id: 'lab.origin', name: '原点', view: 'lab.origin', footprint: { left: 0, top: 0, right: 1, bottom: 1 }, resources: {},
        optionalAnchors: Array.from({ length: mapSize * mapSize }, (_, i) => `cell-${i % mapSize}-${Math.floor(i / mapSize)}`),
        anchors: Object.fromEntries(Array.from({ length: mapSize * mapSize }, (_, i) => [`cell-${i % mapSize}-${Math.floor(i / mapSize)}`, { x: i % mapSize, y: Math.floor(i / mapSize) }])) },
      { id: 'lab.desk', name: '交互台', view: 'lab.desk', footprint: { left: 0, top: 0, right: 2, bottom: 2 }, resources: {},
        anchors: { seat: { x: 0, y: 1 }, entry: { x: 0, y: 2 }, side: { x: -1, y: 1 } },
        interactions: { seat: { name: '入座', anchor: 'seat', approaches: ['entry', 'side'], cells: [{ x: 0, y: 1 }, { x: 1, y: 1 }], posture: 'seated', facing: 'back' } } },
      { id: 'lab.block', name: '遮挡块', view: 'lab.block', footprint: { left: 0, top: 0, right: 1, bottom: 2 }, anchors: {}, resources: {} },
    ],
    capabilities: [{ id: 'lab.work', name: '入座工作', params: z.strictObject({}), build(context) {
      if (context.participants.length !== 1 || context.participants[0].role !== 'actor' || context.participants[0].entityId !== 'visitor') throw new SceneFault('INVALID_PARTICIPANTS', '需要测试实体')
      return { title: '入座工作', claims: [{ resource: 'actor:visitor:body', units: 1 }], phases: [
        { title: '前往交互台', moves: [{ actorId: 'visitor', targetId: 'desk', anchor: 'seat', interactionId: 'seat' }] },
        { title: '工作中', durationMs: 4000, actions: [{ actorId: 'visitor', actionId: 'lab.work' }] },
      ] }
    } }],
  }],
  createWorld(sceneId = 'dimetric-lab') {
    return { sceneId, unit: 'cell', width: mapSize, height: mapSize, gridSize: 1, layoutRevision: 0,
      bounds: { left: 0, top: 0, right: mapSize, bottom: mapSize },
      walkableArea: [{ x: 0, y: 0 }, { x: mapSize, y: 0 }, { x: mapSize, y: mapSize }, { x: 0, y: mapSize }],
      actors: [{ id: 'visitor', name: '测试实体', templateId: 'lab.marker', color: 0x427c91, position: { x: 2, y: 6 }, homeId: 'desk',
        facing: 'back', posture: 'standing', presentation: { status: 'idle', title: '', sourceRevision: 0 } }],
      props: [
        { id: 'origin', name: '原点', templateId: 'lab.origin', position: { x: 0, y: 0 }, state: {}, stateRevision: 0 },
        { id: 'desk', name: '交互台', templateId: 'lab.desk', position: { x: 4, y: 3 }, state: {}, stateRevision: 0 },
        { id: 'block', name: '遮挡块', templateId: 'lab.block', position: { x: 7, y: 5 }, state: {}, stateRevision: 0 },
      ] }
  },
}
