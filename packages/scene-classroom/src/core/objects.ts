import { z } from 'zod'
import type { ScenePlugin } from '@pixoffice/runtime'

export const blackboardStateSchema = z.strictObject({
  title: z.string().max(36), text: z.string().max(180),
})

export const classroomObjects: ScenePlugin = {
  id: 'classroom.objects', name: '教室家具', version: '1.0.0', apiVersion: 1,
  templates: [
    { id: 'classroom.desk', name: '课桌椅', view: 'classroom.desk',
      // Desk row, owner-only docking row, and rear chair-foot row.
      footprint: { left: 0, top: 0, right: 3, bottom: 3 },
      anchors: { seat: { x: 1, y: 1 }, left: { x: -1, y: 1 }, right: { x: 3, y: 1 } },
      resources: { seat: 1 },
      interactions: { seat: { name: '入座', anchor: 'seat', approaches: ['left', 'right'],
        cells: [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
        facing: 'back', posture: 'seated', requiresHome: true, resource: 'seat' } },
    },
    { id: 'classroom.blackboard', name: '黑板', view: 'classroom.blackboard',
      footprint: { left: 0, top: 0, right: 8, bottom: 1 },
      anchors: { teacher: { x: 1, y: 3 }, speaker: { x: 5, y: 2 } },
      resources: { lesson: 1 },
    },
  ],
  stateSchemas: { 'classroom.blackboard': blackboardStateSchema },
}
