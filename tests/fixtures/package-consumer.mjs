import assert from 'node:assert/strict'
import { createSceneRuntime } from '@pixoffice/runtime'
import { officeScenePack } from '@pixoffice/scene-office'
import { FrameAdapter } from '@pixoffice/animation-frame'
import { AnimationRegistry, SceneView } from '@pixoffice/renderer-pixi'
import { createOfficePresentation } from '@pixoffice/scene-office/pixi'
import { visualAssetManifestSchema } from '@pixoffice/contracts'

assert.equal(typeof document, 'undefined')
assert.equal(typeof SceneView, 'function')
assert.equal(typeof visualAssetManifestSchema.parse, 'function')
new AnimationRegistry().register(new FrameAdapter())
const runtime = createSceneRuntime(officeScenePack)
try {
  const [visitor, host] = runtime.readActors()
  assert.equal(runtime.readActors().length, 6)
  assert.equal(createOfficePresentation().projectActors(runtime).length, 6)
  const result = runtime.submit({ protocolVersion: '2.0', sceneId: runtime.sceneId,
    commandId: 'installed-visit', type: 'activity.start', capability: 'office.visit',
    participants: [{ entityId: visitor.id, role: 'visitor' }, { entityId: host.id, role: 'host' }],
    params: { stops: [{ hostId: host.id, message: 'A packaged office works.' }] } })
  assert.equal(result.status, 'running')
  for (let i = 0; i < 2000 && runtime.getRecord('installed-visit').status === 'running'; i++) runtime.tick(50)
  assert.equal(runtime.getRecord('installed-visit').status, 'completed')
  assert.throws(() => import.meta.resolve('@pixoffice/runtime/src/SceneRuntime'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' })
  console.log('Standalone office visit completed; private source imports rejected.')
} finally { runtime.dispose() }
