import assert from 'node:assert/strict'
import { createSceneRuntime } from '@pixoffice/runtime'
import { createFarmScenePack, createFarmClock } from '@pixoffice/scene-farm'
import { createFarmPresentation } from '@pixoffice/scene-farm/pixi'
import { bindFarmFrames } from '@pixoffice/assets-farm'

assert.equal(typeof document, 'undefined')
assert.equal(typeof bindFarmFrames, 'function')
for (const name of ['scene-office', 'assets-office', 'scene-classroom', 'assets-classroom']) assert.throws(() => import.meta.resolve(`@pixoffice/${name}`), { code: 'ERR_MODULE_NOT_FOUND' })
const clock = createFarmClock(), runtime = createSceneRuntime(createFarmScenePack(clock.now))
try {
  assert.equal(createFarmPresentation('https://example.test/farm/', clock.now).projectActors(runtime).length, 2)
  runtime.submit({ protocolVersion: '2.0', sceneId: runtime.sceneId, commandId: 'plant', type: 'activity.start', capability: 'farm.plant',
    participants: [{ entityId: 'farmer-1', role: 'farmer' }], params: { plotId: 'plot-1', crop: 'tomato' } })
  for (let n = 0; n < 2000 && runtime.getRecord('plant').status === 'running'; n++) { clock.advance(50); runtime.tick(50) }
  assert.equal(runtime.getRecord('plant').status, 'completed')
  assert.equal(runtime.readWorld().props.find(p => p.id === 'plot-1').state.crop, 'tomato')
  console.log('Packed farm plants independently; office and classroom packages are not installed.')
} finally { runtime.dispose() }
