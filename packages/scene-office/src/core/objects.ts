import { z } from 'zod'
import type { ScenePlugin } from '@pixoffice/runtime/plugins'

export const officeObjects: ScenePlugin = {
  id: 'office.objects', name: '办公室场景与物品', version: '1.0.0', apiVersion: 1,
  templates: [
    { id: 'office.workstation', name: '办公桌椅', view: 'workstation',
      footprint: { left: 0, right: 2, top: 0, bottom: 2 },
      interactions: { seat: { name: '入座工作', anchor: 'seat', approaches: ['seatLeft', 'seatRight'], cells: [{ x: 0, y: 1 }, { x: 1, y: 1 }], facing: 'back', posture: 'seated', requiresHome: true } },
      anchors: { seat: { x: 0, y: 1 }, seatStand: { x: 0, y: 1 }, seatEntry: { x: -1, y: 1 }, seatLeft: { x: -1, y: 1 }, seatRight: { x: 2, y: 1 }, visitor: { x: -1, y: 1 }, visitorRight: { x: 2, y: 1 }, visitorFront: { x: 0, y: 2 }, conversationLeft: { x: -1, y: 1 }, conversationRight: { x: 2, y: 1 } },
      optionalAnchors: ['seatStand', 'seatEntry', 'seatLeft', 'seatRight', 'visitor', 'visitorRight', 'visitorFront', 'conversationLeft', 'conversationRight'], resources: { visitor: 1, seat: 1 } },
    { id: 'office.whiteboard', name: '会议白板', view: 'whiteboard',
      footprint: { left: 0, right: 2, top: 0, bottom: 1 },
      interactions: { write: { name: '查看白板', anchor: 'attendee1', approaches: ['attendee1'], cells: [], posture: 'standing', facing: 'back', resource: 'meeting' } },
      anchors: { attendee1: { x: 0, y: 1 }, attendee2: { x: 1, y: 1 }, attendee3: { x: 0, y: 2 }, attendee4: { x: 1, y: 2 } }, resources: { meeting: 1 } },
  ],
  stateSchemas: { 'office.whiteboard': z.strictObject({ title: z.string().max(60), text: z.string().max(500) }) },
}
