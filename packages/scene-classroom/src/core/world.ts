import type { Actor, World } from '@pixoffice/runtime'

export const classroomRoster = [
  { id: 'teacher', name: '顾老师', appearanceId: 'classroom-teacher', role: 'teacher' },
  { id: 'student-1', name: '小林', appearanceId: 'classroom-student-1', role: 'student' },
  { id: 'student-2', name: '小周', appearanceId: 'classroom-student-2', role: 'student' },
  { id: 'student-3', name: '小陈', appearanceId: 'classroom-student-3', role: 'student' },
  { id: 'student-4', name: '小夏', appearanceId: 'classroom-student-4', role: 'student' },
  { id: 'student-5', name: '小赵', appearanceId: 'classroom-student-5', role: 'student' },
] as const

export function createClassroomWorld(sceneId = 'classroom'): World {
  const desks = [{ x: 5, y: 10 }, { x: 10, y: 10 }, { x: 15, y: 10 }, { x: 7, y: 14 }, { x: 13, y: 14 }]
  const actors: Actor[] = classroomRoster.map((person, index) => ({
    id: person.id, name: person.name, templateId: person.appearanceId, color: 0x63948b,
    position: index === 0 ? { x: 9, y: 9 } : { x: desks[index - 1].x + 1, y: desks[index - 1].y + 1 },
    ...(index ? { homeId: `desk-${index}`, using: { propId: `desk-${index}`, interactionId: 'seat' } } : {}),
    facing: index ? 'back' : 'front', posture: index ? 'seated' : 'standing',
    presentation: { status: 'idle', title: '', sourceRevision: 0 },
  }))
  return {
    sceneId, unit: 'cell', width: 24, height: 19, gridSize: 1, layoutRevision: 0,
    bounds: { left: 0, top: 0, right: 24, bottom: 19 },
    walkableArea: [{ x: 3, y: 6 }, { x: 21, y: 6 }, { x: 21, y: 18 }, { x: 3, y: 18 }],
    actors,
    props: [
      { id: 'blackboard', name: '课堂黑板', templateId: 'classroom.blackboard', position: { x: 8, y: 6 },
        state: { title: '认识太阳系', text: '我们生活在哪颗行星？\n地球为什么会有白天和黑夜？' }, stateRevision: 0 },
      ...desks.map((position, index) => ({ id: `desk-${index + 1}`, name: `${actors[index + 1].name}的课桌`,
        templateId: 'classroom.desk', position, state: {}, stateRevision: 0 })),
    ],
  }
}
