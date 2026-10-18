import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { createTestServer } from './helpers/vite.mjs'
import { frameVisualFixture } from './helpers/frameVisual.mjs'
let server, createOfficeRuntime, presentation
before(async () => {
  server = await createTestServer()
  ;({ createOfficeRuntime } = await server.ssrLoadModule('/example/office-web/src/application/createOfficeRuntime.ts'))
  const { createOfficePresentation } = await server.ssrLoadModule('/packages/scene-office/src/pixi/index.ts')
  presentation = createOfficePresentation()
})
after(() => server?.close())

test('speech frames preserve every pixel outside their authored mouth patch', async () => {
  const placements = JSON.parse(await readFile(new URL('../art/characters/speech-mouths/placement.json', import.meta.url), 'utf8'))
  for (const [id, poses] of Object.entries(placements)) for (const [pose, [x, y, width, height]] of Object.entries(poses)) {
    const root = new URL('../art/characters/packs/' + id + '/', import.meta.url)
    const file = pose === 'seated-right' ? 'talk/seated-right/001.png' : 'idle/' + pose + '/001.png'
    const original = await sharp(new URL(file, root).pathname).ensureAlpha().raw().toBuffer()
    for (const stage of ['001', '002', '003']) {
      const image = await sharp(new URL('speak/' + pose + '/' + stage + '.png', root).pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      let changed = 0
      for (let row = 0; row < image.info.height; row++) for (let col = 0; col < image.info.width; col++) {
        const offset = (row * image.info.width + col) * 4
        assert.equal(image.data[offset + 3], original[offset + 3])
        if (!image.data.subarray(offset, offset + 4).equals(original.subarray(offset, offset + 4))) {
          changed++; assert(col >= x && col < x + width && row >= y && row < y + height)
        }
      }
      assert(changed > 10)
    }
  }
})

test('the live runtime and current adapter animate the visitor, then the seated responder, and stop both mouths', async t => {
  const runtime = createOfficeRuntime(), models = new Map()
  t.after(() => runtime.dispose())
  for (const id of ['office-lead', 'code-agent']) models.set(id, await frameVisualFixture(t, server, id))
  runtime.submit({ protocolVersion: '2.0', sceneId: 'office-1', commandId: 'speech', type: 'activity.start', capability: 'office.visit',
    participants: [{ entityId: 'office-lead', role: 'visitor' }, { entityId: 'code-agent', role: 'host' }],
    params: { stops: [{ hostId: 'code-agent', message: 'Please do this task.', reply: 'Received.' }], durationMs: 800 } })
  const seen = new Set()
  for (let i = 0; i < 1200 && runtime.getRecord('speech').status === 'running'; i++) {
    runtime.tick(50)
    const projected = presentation.projectActors(runtime)
    for (const actor of projected.filter(actor => models.has(actor.id))) {
      const model = models.get(actor.id), root = model.present(actor, .05)
      if (!actor.intent.speech) continue
      seen.add(actor.id); assert(root.mouthSprite.visible)
      assert(projected.filter(other => other.id !== actor.id).every(other => !other.intent.speech))
      const speech = model.state.actions.find(action => action.variantId.startsWith('core.speak'))
      assert(speech)
      assert.equal(root.mouthSprite.texture, model.texture('mouth.right-speaking', speech.clock.elapsedMs))
    }
  }
  assert.deepEqual([...seen], ['office-lead', 'code-agent'])
  assert.equal(runtime.getRecord('speech').status, 'completed')
  assert(runtime.readActors().every(actor => !actor.speech))
})
