import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'
import { characterPackFixture } from './helpers/characterPack.mjs'
import { frameVisualFixture } from './helpers/frameVisual.mjs'

test('task labels stay above the head independently of the beside-seat name label', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { StatusLabel } = await server.ssrLoadModule('/packages/renderer-pixi/src/ui/StatusLabel.ts')
  t.mock.method(StatusLabel.prototype, 'paintStateDot', () => {})
  const label = new StatusLabel('王明')
  t.after(() => label.destroy({ children: true }))
  for (const text of [label.nameText, label.taskText]) {
    Object.defineProperties(text, { width: { get: () => 60 }, height: { get: () => 12 } })
  }
  label.setTask('登录接口')
  label.layout(-100)
  label.layoutBeside(62, 29, 1.15, -100)
  const taskCenter = label.x + label.taskLayer.x * label.scale.x
  const taskBottom = label.y + label.taskLayer.y * label.scale.y
  assert.equal(taskCenter, 0)
  assert.equal(taskBottom, -108)
  assert.equal(label.x, 62, 'the name stays beside the seat')
  assert.equal(label.y, 29)
  assert.equal(label.getLabelTopY(-100), -108 - 18 * 1.15)
  label.setTask('联调测试')
  label.layout(-100); label.layoutBeside(62, 29, 1.15, -100)
  assert.equal(label.y + label.taskLayer.y * label.scale.y, taskBottom)
  label.layout(-100)
  assert.equal(label.taskLayer.x, 0, 'classic layouts reset the task offset')
  assert.equal(label.getLabelTopY(-100), -108 - 12 - 2 - 18)
  label.setTask(undefined)
  assert.equal(label.taskBg.visible, false)
})

test('all six work loops keep names and bubbles fixed while complete picture frames change', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  for (const id of ['office-lead', 'code-agent', 'file-agent', 'app-agent', 'review-agent', 'data-agent']) {
    const model = await frameVisualFixture(t, server, id)
    const labels = new Set(), textures = new Set()
    for (let elapsed = 0; elapsed <= 12000; elapsed += 50) {
      const root = model.sample({ actionId: 'office.type', poseId: 'seated', view: 'back', elapsedMs: elapsed })
      labels.add(model.visual.getSocket('ui.label').y)
      textures.add(root.sprite.texture)
    }
    assert.equal(textures.size, 4, `${id}: animation must still play all four pictures`)
    assert.equal(labels.size, 1, `${id}: overlays must not follow per-frame alpha trim`)
  }
})

test('fixed loop labels use the current clip, but seat transitions retain their changing height', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const model = await frameVisualFixture(t, server, 'code-agent'), { pack } = model
  const { manifest } = pack, scale = manifest.displayHeight / manifest.referenceHeight
  const top = file => (manifest.frames[file].offset.y - manifest.pivot.y) * scale - 4
  const character = model.sample({ actionId: 'office.type', poseId: 'seated', view: 'back', elapsedMs: 250 })
  assert.equal(character.getHeadOffsetY(), top(manifest.clips['work.quiet-back'].frames[0].frame))
  model.sample({ poseId: 'seated', view: 'back' })
  assert.equal(character.getHeadOffsetY(), top(manifest.clips['sit.back'].frames[0].frame))
  for (const seatedAmount of [1, 0]) {
    model.sample({ actionId: 'core.stand-up', poseId: 'transition', view: 'back', progress: 1 - seatedAmount })
    const frames = manifest.clips['stand-up.back'].frames
    assert.equal(character.getHeadOffsetY(), top((seatedAmount ? frames[0] : frames.at(-1)).frame))
  }
})
