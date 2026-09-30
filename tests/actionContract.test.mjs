import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'
import { characterPackFixture } from './helpers/characterPack.mjs'
import { base, move, visit, completed, until, noClaims } from './helpers/grid.mjs'

let server, createOfficeRuntime, OfficeRuntime, GridNavigation, MovementController, ApartmentCharacter, CharacterManifestSchema, resolveCharacterClip, characterPoseClip, supportsOfficePose, pack
before(async () => {
  server = await createTestServer()
  ;({ createOfficeRuntime } = await server.ssrLoadModule('/src/runtime/createOfficeRuntime.ts'))
  ;({ OfficeRuntime } = await server.ssrLoadModule('/src/runtime/OfficeRuntime.ts'))
  ;({ GridNavigation } = await server.ssrLoadModule('/src/runtime/navigation.ts'))
  ;({ MovementController } = await server.ssrLoadModule('/src/runtime/movement.ts'))
  ;({ ApartmentCharacter } = await server.ssrLoadModule('/src/scene/characters/ApartmentCharacter.ts'))
  ;({ CharacterManifestSchema, resolveCharacterClip } = await server.ssrLoadModule('/src/scene/characters/packSchema.ts'))
  ;({ characterPoseClip, supportsOfficePose } = await server.ssrLoadModule('/src/contracts/characterPose.ts'))
  pack = await server.ssrLoadModule('/src/runtime/builtin/officePack.ts')
})
after(() => server?.close())

function runtimeFor(t, world = pack.createOfficeWorld(), supportsPose = supportsOfficePose, plugins = pack.builtinPlugins) {
  const runtime = new OfficeRuntime({ world, plugins, supportsPose, createNavigation: templates => new GridNavigation(templates) })
  t.after(() => runtime.dispose())
  return runtime
}
function render(t, resource, actor, state = 'idle') {
  const character = new ApartmentCharacter(actor.templateId)
  character.pack = resource
  t.after(() => character.destroy())
  character.setAtDesk(actor.posture === 'seated')
  character.setViewFacing(actor.facing)
  character.playState(state)
  character.setSpeechText(actor.speech?.text)
  character.update(0)
  return character
}
async function resourceFor(t, id = 'code-agent') {
  const resource = await characterPackFixture(id)
  t.after(() => resource.dispose())
  return resource
}

test('approaching from behind chooses a supported side and renders the actual seated turn', async t => {
  const r = createOfficeRuntime(), resource = await resourceFor(t)
  t.after(() => r.dispose())
  r.submit(move('behind', 'desk-1', 'visitorFront'))
  completed(r, 'behind')
  assert.deepEqual(r.readActors()[0].position, { x: 11, y: 6 })
  r.submit(visit())
  until(r, () => Boolean(r.readActors()[0].speech))
  const host = r.readActors()[1]
  assert.equal(host.posture, 'seated')
  assert.equal(host.facing, 'left', 'nearest legal side is chosen, not the zero-distance rear anchor')
  assert.deepEqual(r.readActors()[0].position, { x: 10, y: 5 })
  const character = render(t, resource, host)
  const clip = resolveCharacterClip(resource.manifest, characterPoseClip(host.posture, host.facing))
  assert.equal(character.sprite.texture, resource.textures.get(clip.frames[0].frame))
  assert.equal(character.actionError, undefined)
  assert.equal(clip.fallback, false)
  until(r, () => Boolean(r.readActors()[1].speech))
  character.setSpeechText(r.readActors()[1].speech.text)
  assert(character.mouthSprite.visible)
  completed(r, 'visit')
  assert.equal(r.readActors()[1].facing, 'back')
  assert.equal(r.readActors()[1].speech, undefined)
  noClaims(r)
})

test('a visitor already beside either legal side does not walk around to the other side', t => {
  for (const [anchor, facing] of [['conversationLeft', 'left'], ['conversationRight', 'right']]) {
    const r = runtimeFor(t)
    r.submit(move(`side-${facing}`, 'desk-1', anchor))
    completed(r, `side-${facing}`)
    const position = r.readActors()[0].position
    r.submit(visit())
    until(r, () => Boolean(r.readActors()[0].speech))
    assert.deepEqual(r.readActors()[0].position, position)
    assert.equal(r.readActors()[1].facing, facing)
    completed(r, 'visit'); noClaims(r)
  }
})

test('edited conversation anchors are checked by actual geometry, not their names', t => {
  const world = pack.createOfficeWorld()
  world.props[1].anchors = { conversationLeft: { x: 0, y: 2 } }
  const r = runtimeFor(t, world)
  r.submit(move('behind', 'desk-1', 'visitorFront')); completed(r, 'behind')
  r.submit(visit()); until(r, () => Boolean(r.readActors()[0].speech))
  assert.deepEqual(r.readActors()[0].position, { x: 13, y: 5 })
  assert.equal(r.readActors()[1].facing, 'right')
  completed(r, 'visit'); noClaims(r)
})

test('missing a side clip filters that side; missing both fails explicitly without speaking', async t => {
  const resource = await resourceFor(t)
  delete resource.manifest.clips['talk.seated-left']
  const supports = (id, posture, facing) => id === 'code-agent'
    ? Boolean(resolveCharacterClip(resource.manifest, characterPoseClip(posture, facing)))
    : supportsOfficePose(id, posture, facing)
  const r = runtimeFor(t, undefined, supports)
  r.submit(visit()); until(r, () => Boolean(r.readActors()[0].speech))
  assert.equal(r.readActors()[1].facing, 'right')
  completed(r, 'visit'); noClaims(r)
  delete resource.manifest.clips['talk.seated-right']
  r.submit(visit('missing-both'))
  until(r, () => r.getRecord('missing-both').status === 'failed')
  const failed = r.getRecord('missing-both')
  assert.equal(failed.status, 'failed')
  assert.equal(failed.error.code, 'UNSUPPORTED_POSE')
  assert(r.readActors().every(actor => !actor.speech))
  assert.equal(r.readActors()[1].facing, 'back')
  noClaims(r)
})

test('blocked legal sides never fall back to a rear pose the character cannot perform', t => {
  const world = pack.createOfficeWorld()
  for (const [i, position] of [[2, { x: 10, y: 5 }], [3, { x: 13, y: 5 }]]) {
    Object.assign(world.actors[i], { posture: 'standing', position, using: undefined })
  }
  const r = runtimeFor(t, world)
  r.submit(visit())
  until(r, () => r.getRecord('visit').status === 'failed')
  const failed = r.getRecord('visit')
  assert.equal(failed.status, 'failed')
  assert.equal(failed.error.code, 'NO_ROUTE')
  assert(r.readActors().every(actor => !actor.speech))
  noClaims(r)
})

test('blocked-route replanning retains the arrival pose contract', t => {
  const r = runtimeFor(t), world = r.readWorld()
  const actor = world.actors[0], host = world.actors[1]
  Object.assign(actor, { posture: 'standing', position: { x: 11, y: 6 }, using: undefined })
  let allowed = 'left'
  const controller = new MovementController(r.navigation, { template: id => r.template(id) }, undefined,
    (id, posture, facing) => id === host.templateId && posture === 'seated' ? facing === allowed : supportsOfficePose(id, posture, facing))
  const goal = { actorId: actor.id, targetId: 'desk-1', anchor: 'conversationLeft', alternatives: ['conversationRight', 'visitorFront'] }
  const poses = [{ actorId: actor.id, posture: 'standing', lookAt: host.id }, { actorId: host.id, posture: 'seated', lookAt: actor.id }]
  const first = controller.resolve(world, goal, new Set([actor.id]), [], poses)
  assert.equal(first.destination.x, 10)
  controller.start(first)
  Object.assign(world.actors[2], { posture: 'standing', using: undefined, position: first.path[0] })
  allowed = 'right'
  for (let i = 0; i < 4; i++) controller.advance(world, actor, 100)
  assert.deepEqual(actor.motion.path.at(-1), { x: 13, y: 5 }, 'replanning must not forget the required seated turn')
})

test('unsupported explicit poses fail before applying any pose or starting speech', t => {
  const invalid = { id: 'test.pose', name: 'Invalid pose', version: '1.0.0', apiVersion: 1, capabilities: [{
    ...pack.officeVisits.capabilities[0], id: 'test.pose', build() { return { title: 'Unsupported', claims: [
      { resource: 'actor:marvis:body', units: 1 }, { resource: 'actor:code-agent:body', units: 1 }, { resource: 'actor:marvis:speech', units: 1 },
    ], phases: [{ title: 'Invalid', poses: [{ actorId: 'marvis', posture: 'seated', facing: 'left' }, { actorId: 'code-agent', posture: 'seated', facing: 'front' }], speech: [{ actorId: 'marvis', text: 'must not speak' }] }] } },
  }] }
  const r = runtimeFor(t, undefined, undefined, [...pack.builtinPlugins, invalid])
  const result = r.submit({ ...visit(), capability: 'test.pose' })
  assert.equal(result.error.code, 'UNSUPPORTED_POSE')
  assert(r.readActors().every(actor => actor.facing === 'back' && !actor.speech))
  assert(!r.snapshot().events.some(event => event.type === 'activity.phase'))
  noClaims(r)
})

test('renderer never substitutes back sitting or work for an unsupported seated front', async t => {
  const resource = await resourceFor(t, 'marvis')
  const character = render(t, resource, { templateId: 'marvis', posture: 'seated', facing: 'front' }, 'working')
  assert.match(character.actionError, /talk\.seated-front/)
  assert.equal(character.sprite.visible, false)
  character.setViewFacing('right')
  assert.equal(character.actionError, undefined)
  assert.equal(character.sprite.visible, true)
  const right = resolveCharacterClip(resource.manifest, 'talk.seated-right')
  assert.equal(character.sprite.texture, resource.textures.get(right.frames[0].frame))
  character.setViewFacing('back')
  const work = resolveCharacterClip(resource.manifest, 'work.quiet-back')
  assert.equal(character.sprite.texture, resource.textures.get(work.frames[0].frame))
})

test('office asset validation rejects missing standard seated turn actions', async t => {
  const resource = await resourceFor(t)
  assert(CharacterManifestSchema.safeParse(resource.manifest).success)
  for (const name of ['talk.seated-left', 'talk.seated-right']) {
    const invalid = structuredClone(resource.manifest)
    delete invalid.clips[name]
    assert(!CharacterManifestSchema.safeParse(invalid).success)
  }
})

test('cancelling a conversation restores the host pose and clears speech', t => {
  const r = runtimeFor(t)
  r.submit(visit()); until(r, () => Boolean(r.readActors()[1].speech))
  r.submit({ ...base('cancel'), type: 'command.cancel', targetCommandId: 'visit' })
  until(r, () => r.snapshot().resources.every(resource => !resource.holders.length))
  assert.equal(r.readActors()[1].facing, 'back')
  assert(r.readActors().every(actor => !actor.speech))
})
