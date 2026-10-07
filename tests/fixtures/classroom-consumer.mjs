import assert from 'node:assert/strict'
import { createSceneRuntime } from '@pixoffice/runtime'
import { classroomScenePack } from '@pixoffice/scene-classroom'
import { createClassroomPresentation } from '@pixoffice/scene-classroom/pixi'
import { classroomAppearanceIds, bindClassroomFrames } from '@pixoffice/assets-classroom'

assert.equal(typeof document, 'undefined')
assert.equal(typeof bindClassroomFrames, 'function')
assert.equal(classroomAppearanceIds.length, 6)
assert.throws(() => import.meta.resolve('@pixoffice/scene-office'), { code: 'ERR_MODULE_NOT_FOUND' })
assert.throws(() => import.meta.resolve('@pixoffice/assets-office'), { code: 'ERR_MODULE_NOT_FOUND' })
const runtime = createSceneRuntime(classroomScenePack)
try {
  assert.equal(createClassroomPresentation('https://example.test/classroom/').projectActors(runtime).length, 6)
  const command = { protocolVersion: '2.0', sceneId: runtime.sceneId, commandId: 'answer', type: 'activity.start', capability: 'classroom.answer',
    participants: [{ entityId: 'teacher', role: 'teacher' }, { entityId: 'student-5', role: 'student' }],
    params: { question: 'Where do we live?', answer: 'Earth.', durationMs: 1000 } }
  assert.equal(runtime.submit(command).status, 'running')
  for (let i = 0; i < 2000 && runtime.getRecord('answer').status === 'running'; i++) runtime.tick(50)
  assert.equal(runtime.getRecord('answer').status, 'completed')
  assert.equal(runtime.readActors().find(a => a.id === 'student-5').posture, 'seated')
  console.log('Packed classroom answers and returns to its seat; office packages are not installed.')
} finally { runtime.dispose() }
