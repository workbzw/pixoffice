import type { Actor, World } from '@pixoffice/runtime/model'
import { OFFICE_ROSTER } from './roster.ts'
import { OFFICE_WALKABLE_AREA } from './officeFloor.ts'

const people = OFFICE_ROSTER.map(({ id, name, color }) => [id, name, color] as const)

export function createOfficeWorld(sceneId = 'office-1'): World {
  const props = people.map((_, i) => ({ id: `desk-${i}`, name: `${people[i][1]}的工位`, templateId: 'office.workstation', position: { x: 6 + i % 2 * 5, y: 4 + Math.floor(i / 2) * 3 }, state: {}, stateRevision: 0 }))
  const actors: Actor[] = people.map(([id, name, color], i) => ({ id, name, templateId: id, color, homeId: props[i].id,
    position: { x: props[i].position.x, y: props[i].position.y + 1 }, facing: 'back', posture: 'seated', using: { propId: props[i].id, interactionId: 'seat' },
    presentation: { status: 'idle', title: '等待指令', sourceRevision: 0 } }))
  return { sceneId, unit: 'cell', width: 20, height: 13, gridSize: 1, layoutRevision: 0,
    bounds: { left: 4, top: 4, right: 16, bottom: 12 }, walkableArea: OFFICE_WALKABLE_AREA.map(point => ({ ...point })), actors,
    props: [...props, { id: 'whiteboard-1', name: '协作白板', templateId: 'office.whiteboard', position: { x: 4, y: 7 }, state: { title: '团队协作', text: '等待议题' }, stateRevision: 0 }] }
}
