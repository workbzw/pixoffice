import { z } from 'zod'
import type { ScenePack } from '@pixoffice/runtime/scenePack'
import type { ScenePlugin } from '@pixoffice/runtime/plugins'
import type { World } from '@pixoffice/runtime/model'
import { createOfficeWorld } from './definition.ts'
import { builtinPlugins } from './pack.ts'
import { supportsOfficePose } from './poseSupport.ts'
import { whiteboardTaskBoardSchema } from '../whiteboard.ts'

const task = z.strictObject({ title: z.string().max(160), status: z.enum(['queued', 'running', 'blocked', 'completed', 'failed']), progress: z.number().min(0).max(100).optional() })
export const referenceOfficeObjects: ScenePlugin = {
  id: 'office.reference-objects', name: '明亮办公室家具', version: '1.0.0', apiVersion: 1, dependencies: ['office.objects'],
  templates: [
    { id: 'office.reference-workstation', name: '宽桌办公工位', view: 'reference-workstation',
      // The open floor row behind each desk connects the two office aisles.
      footprint: { left: 0, top: 1, right: 4, bottom: 3 },
      interactions: { seat: { name: '入座工作', anchor: 'seat', approaches: ['seatLeft', 'seatRight'],
        cells: [0, 1, 2, 3].map(x => ({ x, y: 2 })), facing: 'back', posture: 'seated', requiresHome: true } },
      anchors: { seat: { x: 1, y: 2 }, seatStand: { x: 1, y: 2 }, seatEntry: { x: -1, y: 2 }, seatLeft: { x: -1, y: 2 }, seatRight: { x: 4, y: 2 },
        visitor: { x: -1, y: 2 }, visitorRight: { x: 4, y: 2 }, visitorFront: { x: 1, y: 3 }, conversationLeft: { x: -1, y: 2 }, conversationRight: { x: 4, y: 2 } },
      optionalAnchors: ['seatStand', 'seatEntry', 'seatLeft', 'seatRight', 'visitor', 'visitorRight', 'visitorFront', 'conversationLeft', 'conversationRight'], resources: { seat: 1, visitor: 1 } },
    { id: 'office.wall-whiteboard', name: '后墙协作白板', view: 'wall-whiteboard', footprint: { left: 0, top: 0, right: 12, bottom: 1 }, initialState: { title: '', tasks: [] },
      interactions: { write: { name: '查看白板', anchor: 'attendee1', approaches: ['attendee1'], cells: [], posture: 'standing', facing: 'back', resource: 'meeting' } },
      anchors: { attendee1: { x: 5, y: 1 }, attendee2: { x: 6, y: 1 }, attendee3: { x: 5, y: 2 }, attendee4: { x: 6, y: 2 } }, resources: { meeting: 1 } },
    { id: 'office.conference-table', name: '会议桌椅', view: 'conference-table', footprint: { left: 0, top: 0, right: 8, bottom: 3 }, anchors: {}, resources: {} },
  ],
  stateSchemas: { 'office.wall-whiteboard': z.strictObject({ title: z.string().max(80).default(''),
    taskBoard: whiteboardTaskBoardSchema.optional(), tasks: z.array(task).max(12).optional() }) },
}

export function createReferenceOfficeWorld(sceneId = 'office-1'): World {
  const world = createOfficeWorld(sceneId)
  const positions = [{ x: 5, y: 5 }, { x: 12, y: 11 }, { x: 5, y: 8 }, { x: 12, y: 5 }, { x: 5, y: 11 }, { x: 12, y: 8 }]
  world.width = 22; world.height = 17
  world.bounds = { left: 3, top: 4, right: 19, bottom: 17 }
  world.walkableArea = [{ x: 3, y: 4 }, { x: 19, y: 4 }, { x: 19, y: 17 }, { x: 3, y: 17 }]
  world.props.slice(0, 6).forEach((prop, i) => { prop.templateId = 'office.reference-workstation'; prop.position = positions[i] })
  world.actors.forEach((actor, i) => { actor.position = { x: positions[i].x + 1, y: positions[i].y + 2 } })
  const board = world.props[6]
  board.templateId = 'office.wall-whiteboard'; board.position = { x: 5, y: 4 }
  board.state = { title: '项目推进', tasks: [] }
  world.props.push({ id: 'conference-table-1', name: '团队会议桌', templateId: 'office.conference-table', position: { x: 7, y: 14 }, state: {}, stateRevision: 0 })
  return world
}

export const referenceOfficeScenePack: ScenePack = {
  manifest: { id: 'pixoffice.office.reference', version: '1.0.0', apiVersion: 1 },
  plugins: [...builtinPlugins, referenceOfficeObjects], createWorld: createReferenceOfficeWorld,
  supportsPose: supportsOfficePose,
}
