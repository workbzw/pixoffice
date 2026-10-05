import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { createTestServer } from './helpers/vite.mjs'
import { characterPackFixture, legacyCharacterPackFixture } from './helpers/characterPack.mjs'

let server, ApartmentCharacter, sampleCharacterClip, createOfficeRuntime, projectAgents
before(async () => {
  server = await createTestServer()
  ;({ ApartmentCharacter } = await server.ssrLoadModule('/example/office-web/src/scene/characters/ApartmentCharacter.ts'))
  ;({ sampleCharacterClip } = await server.ssrLoadModule('/example/office-web/src/scene/characters/packSchema.ts'))
  ;({ createOfficeRuntime } = await server.ssrLoadModule('/example/office-web/src/runtime/createOfficeRuntime.ts'))
  ;({ projectAgents } = await server.ssrLoadModule('/example/office-web/src/runtime/adapters/legacy.ts'))
})
after(() => server?.close())

async function figure(t, id = 'marvis', legacy = false) {
  const pack = await (legacy ? legacyCharacterPackFixture() : characterPackFixture(id))
  const character = new ApartmentCharacter(id)
  character.pack = pack
  t.after(() => { character.destroy(); pack.dispose() })
  return { character, pack, texture: (clip, time = 0) => pack.textures.get(sampleCharacterClip(pack.manifest, clip, time).key) }
}

test('speech frames alter only the mouth patch and preserve every character silhouette and canvas', async () => {
  const placements = JSON.parse(await readFile(new URL('../art/characters/speech-mouths/placement.json', import.meta.url), 'utf8'))
  for (const [id, poses] of Object.entries(placements)) for (const [pose, [x, y, width, height]] of Object.entries(poses)) {
    const base = pose === 'seated-right' ? 'talk/seated-right/001.png' : `idle/${pose}/001.png`
    const root = new URL(`../art/characters/packs/${id}/`, import.meta.url)
    const original = await sharp(new URL(base, root).pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const variants = new Set()
    for (let stage = 1; stage <= 3; stage++) {
      const next = await sharp(new URL(`speak/${pose}/${String(stage).padStart(3, '0')}.png`, root).pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      assert.equal(next.info.width, original.info.width)
      assert.equal(next.info.height, original.info.height)
      let changes = 0
      for (let row = 0; row < next.info.height; row++) for (let col = 0; col < next.info.width; col++) {
        const offset = (row * next.info.width + col) * 4
        assert.equal(next.data[offset + 3], original.data[offset + 3], `${id}/${pose}: silhouette alpha changed`)
        const changed = !next.data.subarray(offset, offset + 4).equals(original.data.subarray(offset, offset + 4))
        if (!changed) continue
        changes++
        assert(col >= x && col < x + width && row >= y && row < y + height, `${id}/${pose}: pixel changed outside mouth`)
      }
      assert(changes > 10)
      variants.add(next.data.toString('base64'))
    }
    assert.equal(variants.size, 3, `${id}/${pose}: three distinct mouth shapes`)
  }
})

test('legacy full-frame packs still use real speech and restore their exact listening pose', async t => {
  const { character, pack, texture } = await figure(t, 'code-agent', true)
  character.setViewFacing('right'); character.playState('talking'); character.update(0)
  assert.equal(character.sprite.texture, texture('idle.right'), 'talking state alone is not a speech event')
  character.setSpeechText('Please take the next task.')
  assert.equal(character.sprite.texture, texture('speak.right'))
  character.update(.12)
  assert.equal(character.sprite.texture, texture('speak.right', 120))
  character.setSpeechText('Please take the next task.')
  character.update(0)
  assert.equal(character.sprite.texture, texture('speak.right', 120), 'repeated projection never restarts the mouth clock')
  character.setSpeechText('Another sentence.')
  assert.equal(character.sprite.texture, texture('speak.right'), 'new speech starts at its first frame')
  assert.equal(character.sprite.scale.y, pack.manifest.displayHeight / pack.manifest.referenceHeight)
  character.setSpeechText(undefined)
  assert.equal(character.sprite.texture, texture('idle.right'))
  character.setAtDesk(true); character.playState('idle'); character.setViewFacing('left')
  assert.equal(character.sprite.texture, texture('talk.seated-left'))
  character.setSpeechText('Received.')
  assert.equal(character.sprite.texture, texture('speak.seated-left'))
  assert(character.sprite.scale.x < 0)
  character.setSpeechText('   ')
  assert.equal(character.sprite.texture, texture('talk.seated-left'))
})

test('walking, seat transitions, back views and explicit expressions keep their original body animation', async t => {
  const { character, pack, texture } = await figure(t, 'code-agent', true)
  character.setSpeechText('A task'); character.setViewFacing('right'); character.playState('walking'); character.update(.125)
  assert.equal(character.sprite.texture, texture('walk.right', 125))
  character.playState('talking', 'emotes/wave'); character.update(0)
  assert.equal(character.sprite.texture, texture('emote.wave'))
  character.playState('idle'); character.setViewFacing('back'); character.update(0)
  assert.equal(character.sprite.texture, texture('idle.back'), 'do not rotate a hidden mouth toward the camera')
  character.setSeatTransition({ stage: 'rising', seatedAmount: .75, progress: .25 }); character.update(0)
  assert.equal(character.sprite.texture, texture('pose.lean'))
  character.setSeatTransition(undefined); character.setViewFacing('right')
  delete pack.manifest.clips['speak.right']
  character.update(.1)
  assert.equal(character.sprite.texture, texture('idle.right'), 'older packs without speech clips remain usable')
})

test('a real handoff animates the visitor first, then the seated responder, and clears both mouths afterwards', async t => {
  const runtime = createOfficeRuntime()
  t.after(() => runtime.dispose())
  const visitor = await figure(t), host = await figure(t, 'code-agent')
  runtime.submit({ protocolVersion: '2.0', sceneId: 'office-1', commandId: 'mouth-handoff', type: 'activity.start', capability: 'office.visit',
    participants: [{ entityId: 'marvis', role: 'visitor' }, { entityId: 'code-agent', role: 'host' }],
    params: { stops: [{ hostId: 'code-agent', message: 'Please do this task.', reply: 'Received.' }], durationMs: 800 } })
  const seen = new Set()
  for (let i = 0; i < 1200 && runtime.getRecord('mouth-handoff').status === 'running'; i++) {
    runtime.tick(50)
    const agents = projectAgents(runtime, false)
    for (const [id, model] of [['marvis', visitor], ['code-agent', host]]) {
      const agent = agents.find(agent => agent.id === id)
      const c = model.character
      c.setAtDesk(agent.seated); c.setSeatTransition(agent.seatTransition); c.setSpeechText(agent.bubbleText); c.setViewFacing(agent.viewFacing); c.playState(agent.state, agent.customAnimation); c.update(.05)
      if (!agent.bubbleText) continue
      seen.add(id)
      const other = agents.find(actor => actor.id === (id === 'marvis' ? 'code-agent' : 'marvis'))
      assert.equal(other.bubbleText, undefined, 'listeners do not speak simultaneously')
      const clip = id === 'marvis' ? `speak.${agent.viewFacing}` : `speak.seated-${agent.viewFacing}`
      assert.equal(c.sprite.texture, model.texture(clip, c.speechElapsed))
      assert(c.mouthSprite.visible)
      assert.equal(c.mouthSprite.texture, model.texture('mouth.right-speaking', c.speechElapsed))
    }
  }
  assert.deepEqual([...seen], ['marvis', 'code-agent'])
  assert.equal(runtime.getRecord('mouth-handoff').status, 'completed')
  assert.equal(visitor.character.speechText, undefined)
  assert.equal(host.character.speechText, undefined)
})
