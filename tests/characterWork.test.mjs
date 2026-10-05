import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'
import { characterPackFixture } from './helpers/characterPack.mjs'

let server, createOfficeRuntime, projectAgents, ApartmentCharacter, sampleCharacterClip, sampleCharacterLayers, transformWorkSurface
before(async () => {
  server = await createTestServer()
  ;({ createOfficeRuntime } = await server.ssrLoadModule('/example/office-web/src/runtime/createOfficeRuntime.ts'))
  ;({ projectAgents } = await server.ssrLoadModule('/example/office-web/src/runtime/adapters/legacy.ts'))
  ;({ ApartmentCharacter } = await server.ssrLoadModule('/example/office-web/src/scene/characters/ApartmentCharacter.ts'))
  ;({ sampleCharacterClip, sampleCharacterLayers } = await server.ssrLoadModule('/example/office-web/src/scene/characters/packSchema.ts'))
  ;({ transformWorkSurface } = await server.ssrLoadModule('/example/office-web/src/scene/characters/workSurface.ts'))
})
after(() => server?.close())

const base = commandId => ({ protocolVersion: '2.0', sceneId: 'office-1', commandId })
const focus = id => ({ ...base(`focus-${id}`), type: 'activity.start', capability: 'office.focus',
  participants: [{ entityId: id, role: 'worker' }], params: { title: `Work: ${id}` } })

function apply(character, agent, dt) {
  const { manifest } = character.pack
  character.setWorkSurface(transformWorkSurface(manifest.work.previewSurface, .3, -128 * .3, -344 * .3))
  character.setAtDesk(agent.seated)
  character.setSeatTransition(agent.seatTransition)
  character.setViewFacing(agent.viewFacing)
  character.setSpeechText(agent.bubbleText)
  character.playState(agent.state, agent.customAnimation)
  character.update(dt)
}

test('all six focus activities keep typing for a minute, then restore external presentation', async t => {
  let now = 1000
  const runtime = createOfficeRuntime({ now: () => now })
  t.after(() => runtime.dispose())
  runtime.submit({ ...base('external-task'), type: 'actor.presentation.set', actorId: 'marvis',
    status: 'thinking', title: 'External task', sourceRevision: 1 })
  const external = runtime.readActors().map(actor => actor.presentation)
  const figures = new Map()
  const activities = []
  for (const actor of runtime.readActors()) {
    const pack = await characterPackFixture(actor.id)
    const character = new ApartmentCharacter(actor.id)
    character.pack = pack
    figures.set(actor.id, { character, pack, seen: new Set() })
    t.after(() => { character.destroy(); pack.dispose() })
    const started = runtime.submit(focus(actor.id))
    assert.equal(started.status, 'completed')
    activities.push(started.activityId)
  }
  for (let i = 0; i < 5; i++) { now += 50; runtime.tick(50) }
  assert(projectAgents(runtime).every(agent => agent.state === 'working'))
  for (const agent of projectAgents(runtime, false)) apply(figures.get(agent.id).character, agent, 0)
  for (let elapsed = 50; elapsed <= 60000; elapsed += 50) {
    now += 50; runtime.tick(50)
    for (const agent of projectAgents(runtime, false)) {
      assert.equal(agent.state, 'working')
      assert.equal(agent.currentTask, `Work: ${agent.id}`)
      const { character, pack, seen } = figures.get(agent.id)
      apply(character, agent, .05)
      assert.equal(character.elapsed, elapsed, 'repeated state projection does not restart the animation')
      const quiet = Boolean(pack.manifest.clips['work.quiet-back'])
      const sample = sampleCharacterLayers(pack.manifest, quiet ? 'work.quiet-back' : 'work.computer-back', elapsed)
      assert.equal(character.sprite.texture, pack.textures.get(sample.body.key))
      assert(character.workSprites.every(sprite => sprite.visible === !quiet))
      seen.add(quiet ? sample.body.key : sample.work.phase)
    }
  }
  assert.deepEqual(runtime.readActors().map(actor => actor.presentation), external, 'focus never overwrites remote task revisions')
  for (const { seen, pack } of figures.values()) assert.equal(seen.size, pack.manifest.clips['work.quiet-back'] ? 4 : 5)
  const phases = runtime.readActivePhases()
  assert.equal(phases.length, 6)
  phases[0].participants.length = 0
  assert.equal(runtime.readActivePhases()[0].participants.length, 1, 'phase reads cannot mutate the live activity')
  for (const [index, activityId] of activities.entries()) {
    assert.equal(runtime.submit({ ...base(`stop-${index}`), type: 'activity.stop', activityId }).status, 'completed')
  }
  assert.equal(runtime.readActivePhases().length, 0)
  for (const [index, agent] of projectAgents(runtime, false).entries()) {
    assert.equal(agent.state, external[index].status)
    assert.equal(agent.currentTask, external[index].title)
    const { character, pack } = figures.get(agent.id)
    apply(character, agent, 0)
    assert.equal(character.sprite.texture, pack.textures.get(sampleCharacterClip(pack.manifest, 'sit.back').key))
  }
})

test('focus starts typing only after returning to the seat, not during walking or docking', t => {
  const runtime = createOfficeRuntime()
  t.after(() => runtime.dispose())
  runtime.submit({ ...base('leave-desk'), type: 'activity.start', capability: 'scene.move',
    participants: [{ entityId: 'marvis', role: 'actor' }], params: { targetId: 'whiteboard-1', anchor: 'attendee1' } })
  for (let i = 0; i < 1000 && runtime.getRecord('leave-desk').status === 'running'; i++) runtime.tick(50)
  assert.equal(runtime.getRecord('leave-desk').status, 'completed')
  assert.equal(runtime.readActors()[0].posture, 'standing')
  assert.equal(runtime.submit(focus('marvis')).status, 'completed')
  let walking = false, working = false
  for (let i = 0; i < 1000; i++) {
    runtime.tick(50)
    const actor = runtime.readActors()[0], agent = projectAgents(runtime, false)[0]
    if (actor.motion || actor.step || actor.seatTransition) {
      assert.notEqual(agent.state, 'working')
      walking ||= agent.state === 'walking'
    } else if (agent.state === 'working') {
      assert.equal(actor.posture, 'seated')
      assert.equal(agent.viewFacing, 'back')
      working = true
      break
    }
  }
  assert(walking)
  assert(working)
})

test('remote working status loops typing without requiring a focus activity', async t => {
  const runtime = createOfficeRuntime()
  const pack = await characterPackFixture()
  const character = new ApartmentCharacter('marvis')
  character.pack = pack
  t.after(() => { character.destroy(); pack.dispose(); runtime.dispose() })
  runtime.submit({ ...base('working'), type: 'actor.presentation.set', actorId: 'marvis',
    status: 'working', title: 'Remote task', sourceRevision: 1 })
  assert.equal(runtime.readActivePhases().length, 0)
  for (let i = 1; i <= 400; i++) {
    apply(character, projectAgents(runtime, false)[0], .05)
    assert.equal(character.sprite.texture, pack.textures.get(sampleCharacterClip(pack.manifest, 'work.quiet-back', i * 50).key))
    assert(character.workSprites.every(sprite => !sprite.visible))
  }
  runtime.submit({ ...base('idle'), type: 'actor.presentation.set', actorId: 'marvis',
    status: 'idle', title: 'Done', sourceRevision: 2 })
  apply(character, projectAgents(runtime, false)[0], 0)
  assert.equal(character.sprite.texture, pack.textures.get(sampleCharacterClip(pack.manifest, 'sit.back').key))
})
