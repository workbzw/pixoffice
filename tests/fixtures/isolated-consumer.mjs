import assert from 'node:assert/strict'
import { createSceneRuntime, scenePrimitives } from '@pixoffice/runtime'
import { FrameAdapter } from '@pixoffice/animation-frame'
import { AnimationRegistry, mountScene } from '@pixoffice/renderer-pixi'
for (const name of ['@pixoffice/scene-office', '@pixoffice/assets-office/frame']) assert.throws(() => import.meta.resolve(name), { code: 'ERR_MODULE_NOT_FOUND' })
new AnimationRegistry().register(new FrameAdapter())
assert.equal(typeof mountScene, 'function')
const runtime = createSceneRuntime({
  manifest: { id: 'empty', version: '1', apiVersion: 1 }, plugins: [scenePrimitives],
  createWorld: () => ({ sceneId: 'empty', unit: 'cell', width: 8, height: 8, gridSize: 1, layoutRevision: 0,
    bounds: { left: 0, top: 0, right: 8, bottom: 8 }, actors: [], props: [] }),
})
assert.equal(runtime.readWorld().sceneId, 'empty'); runtime.dispose()
console.log('Four generic packages work with no office packages installed.')
