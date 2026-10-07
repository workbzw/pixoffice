import { z } from 'zod'
import { SceneFault } from '@pixoffice/runtime'
import type { Actor, Phase, PluginContext, ScenePlugin } from '@pixoffice/runtime'
import { classroomRoster } from './world.ts'

const boardParams = { boardId: z.string().min(1).max(100).default('blackboard') }
const lectureParams = z.strictObject({ ...boardParams, text: z.string().min(1).max(500), durationMs: z.number().int().min(1000).max(120000).default(7000) })
const answerParams = z.strictObject({ ...boardParams, question: z.string().min(1).max(500), answer: z.string().min(1).max(500),
  feedback: z.string().min(1).max(500).default('谢谢你的分享，请回到座位。'), durationMs: z.number().int().min(1000).max(30000).default(4500) })
const resetParams = z.strictObject(boardParams)
const claim = (resource: string) => ({ resource, units: 1 })

function participants(context: PluginContext, requireStudent: boolean) {
  const seen = new Set<string>()
  const people = context.participants.map(participant => {
    const actor = context.world.actors.find(a => a.id === participant.entityId)
    if (!actor) throw new SceneFault('ENTITY_NOT_FOUND', participant.entityId)
    if (seen.has(actor.id)) throw new SceneFault('INVALID_PARTICIPANTS', '参与者不能重复')
    seen.add(actor.id)
    const role = classroomRoster.find(person => person.id === actor.id)?.role
    if (participant.role !== role) throw new SceneFault('INVALID_PARTICIPANTS', `${actor.name}不具备 ${participant.role} 岗位`)
    return { actor, role }
  })
  const teachers = people.filter(p => p.role === 'teacher'), students = people.filter(p => p.role === 'student').map(p => p.actor)
  if (teachers.length !== 1 || (requireStudent && students.length !== 1)) throw new SceneFault('INVALID_PARTICIPANTS', requireStudent ? '回答需要一位教师和一位学生' : '需要一位教师')
  for (const student of students) {
    const desk = context.world.props.find(p => p.id === student.homeId && p.templateId === 'classroom.desk')
    if (!desk) throw new SceneFault('MISSING_BINDING', `${student.name}没有绑定课桌`)
  }
  return { teacher: teachers[0].actor, students }
}
function board(context: PluginContext, id: string) {
  if (!context.world.props.some(p => p.id === id && p.templateId === 'classroom.blackboard')) throw new SceneFault('ENTITY_NOT_FOUND', id)
  return id
}
function claims(people: Actor[], boardId: string) {
  return [...people.flatMap(a => [claim(`actor:${a.id}:body`), claim(`actor:${a.id}:speech`)]), claim(`prop:${boardId}:lesson`)]
}
function seats(students: Actor[]): Phase[] {
  return students.map(student => ({ title: `${student.name}回到座位`, moves: [{ actorId: student.id, targetId: student.homeId!, anchor: 'seat' }] }))
}

export const classroomTeaching: ScenePlugin = {
  id: 'classroom.teaching', name: '课堂教学', version: '1.0.0', apiVersion: 1, dependencies: ['classroom.objects'],
  capabilities: [
    { id: 'classroom.lecture', name: '教师讲课', params: lectureParams, build(context, raw) {
      const p = lectureParams.parse(raw), { teacher, students } = participants(context, false), boardId = board(context, p.boardId)
      return { title: '课堂讲解', claims: claims([teacher, ...students], boardId), phases: [
        ...seats(students),
        { title: '教师来到讲台前', moves: [{ actorId: teacher.id, targetId: boardId, anchor: 'teacher' }] },
        { title: '教师讲解，同学听课', durationMs: p.durationMs, speech: [{ actorId: teacher.id, text: p.text }],
          poses: [{ actorId: teacher.id, posture: 'standing', facing: 'front' }, ...students.map(a => ({ actorId: a.id, posture: 'seated' as const, facing: 'back' as const }))] },
      ] }
    } },
    { id: 'classroom.answer', name: '到黑板前回答', params: answerParams, build(context, raw) {
      const p = answerParams.parse(raw), { teacher, students: [student] } = participants(context, true), boardId = board(context, p.boardId)
      return { title: `${student.name}回答问题`, claims: claims([teacher, student], boardId), phases: [
        { title: '教师准备提问', moves: [{ actorId: teacher.id, targetId: boardId, anchor: 'teacher' }], poses: [{ actorId: teacher.id, posture: 'standing', facing: 'front' }] },
        { title: `请${student.name}回答`, durationMs: 2200, speech: [{ actorId: teacher.id, text: `${student.name}，${p.question}` }] },
        { title: `${student.name}走向黑板`, moves: [{ actorId: student.id, targetId: boardId, anchor: 'speaker' }], poses: [{ actorId: student.id, posture: 'standing', facing: 'front' }] },
        { title: `${student.name}回答问题`, durationMs: p.durationMs, poses: [{ actorId: student.id, posture: 'standing', facing: 'front' }], speech: [{ actorId: student.id, text: p.answer }] },
        { title: '教师反馈', durationMs: 2600, speech: [{ actorId: teacher.id, text: p.feedback }] },
        ...seats([student]),
      ] }
    } },
    { id: 'classroom.settle', name: '返回课堂座位', params: resetParams, build(context, raw) {
      const p = resetParams.parse(raw), { teacher, students } = participants(context, false), boardId = board(context, p.boardId)
      return { title: '准备上课', claims: claims([teacher, ...students], boardId), phases: [
        ...seats(students),
        { title: '教师就位', moves: [{ actorId: teacher.id, targetId: boardId, anchor: 'teacher' }], poses: [{ actorId: teacher.id, posture: 'standing', facing: 'front' }] },
      ] }
    } },
  ],
}
