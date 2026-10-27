import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createTestServer } from './helpers/vite.mjs'

let server, resolveVisualRequest, AnimationPresenter, bindOfficeFrames, bindClassroomFrames, bindFarmFrames, createOfficePresentation, createOfficeRuntime
before(async () => {
  server = await createTestServer()
  ;({ resolveVisualRequest, AnimationPresenter } = await server.ssrLoadModule('/packages/renderer-pixi/src/presentation/AnimationPresenter.ts'))
  ;({ bindOfficeFrames } = await server.ssrLoadModule('@pixoffice/assets-office/frame/bindings'))
  ;({ bindClassroomFrames } = await server.ssrLoadModule('@pixoffice/assets-classroom'))
  ;({ bindFarmFrames } = await server.ssrLoadModule('@pixoffice/assets-farm'))
  ;({ createOfficePresentation } = await server.ssrLoadModule('@pixoffice/scene-office/pixi'))
  ;({ createOfficeRuntime } = await server.ssrLoadModule('/example/office-web/src/application/createOfficeRuntime.ts'))
})
after(async () => { await server?.close() })

async function officeManifest() {
  const registry = JSON.parse(await readFile(new URL('../public/characters/registry.json', import.meta.url)))
  return JSON.parse(await readFile(new URL(`../public/characters/${registry.characters[0].manifest}`, import.meta.url)))
}

test('leisure has a neutral same-pose default, never a guessed pose or a fallback for other actions', async () => {
  const manifest = bindOfficeFrames(await officeManifest(), './manifest.json')
  for (const [poseId, view] of [['standing', 'front'], ['standing', 'left'], ['seated', 'back'], ['seated', 'right']]) {
    const intent = { actionId: 'core.leisure', poseId, view }
    assert.deepEqual(resolveVisualRequest(manifest, intent).variantIds, [`core.idle.${poseId}.${view}`])
  }
  assert.throws(() => resolveVisualRequest(manifest, { actionId: 'core.leisure', poseId: 'seated', view: 'front' }), /Unsupported action/)
  assert.throws(() => resolveVisualRequest(manifest, { actionId: 'office.missing', poseId: 'standing', view: 'front' }), /Unsupported action/)
})

test('office, classroom and farm bind their own optional leisure artwork without coffee-specific identifiers', async () => {
  const office = await officeManifest()
  const room = JSON.parse(await readFile(new URL('../public/classroom-assets/classroom-teacher/visual.json', import.meta.url)))
  const classroom = JSON.parse(await readFile(new URL(`../public/classroom-assets/classroom-teacher/${room.source.uri}`, import.meta.url)))
  const farmVisual = JSON.parse(await readFile(new URL('../public/farm-assets/farm-gardener/visual.json', import.meta.url)))
  const farm = JSON.parse(await readFile(new URL(`../public/farm-assets/farm-gardener/${farmVisual.source.uri}`, import.meta.url)))
  for (const [source, bind, uri] of [[office, bindOfficeFrames, '/office.json'], [classroom, bindClassroomFrames, '/classroom.json'], [farm, bindFarmFrames, '/farm.json']]) {
    // Synthetic aliases exercise the binding contract, not a claim that coffee artwork exists.
    source.clips['leisure.standing-front'] = { alias: 'idle.front', mirrorX: false }
    if (source.clips['sit.back']) source.clips['leisure.seated-back'] = { alias: 'sit.back', mirrorX: false }
    const manifest = bind(source, uri)
    const request = resolveVisualRequest(manifest, { actionId: 'core.leisure', poseId: 'standing', view: 'front' })
    assert.deepEqual(request.variantIds, ['core.leisure.standing.front'])
    assert.equal(manifest.source.bindings[request.variantIds[0]].clip, 'leisure.standing-front')
    assert.equal(manifest.source.uri, uri)
    if (source.clips['sit.back']) assert.deepEqual(resolveVisualRequest(manifest, { actionId: 'core.leisure', poseId: 'seated', view: 'back' }).variantIds, ['core.leisure.seated.back'])
    assert(!JSON.stringify(manifest).includes('coffee'))
  }
})

test('speech interrupts a dedicated leisure animation and uses the ordinary speaking combination', async () => {
  const source = await officeManifest()
  source.clips['leisure.standing-front'] = { alias: 'idle.front', mirrorX: false }
  const manifest = bindOfficeFrames(source, '/manifest.json')
  const actor = { id: 'one', displayHeight: 84, position: { x: 0, y: 0 }, intent: { actionId: 'core.leisure', poseId: 'standing', view: 'front' } }
  const presenter = new AnimationPresenter()
  assert.equal(presenter.sample(actor, manifest, .1).actions[0].variantId, 'core.leisure.standing.front')
  const speaking = presenter.sample({ ...actor, intent: { ...actor.intent, actionId: 'core.idle', speech: '开始工作。' } }, manifest, 0)
  assert.deepEqual(speaking.request.variantIds, ['core.idle.standing.front', 'core.speak.standing.front'])
  assert.equal(speaking.actions[0].clock.elapsedMs, 0)
  assert.deepEqual(resolveVisualRequest(manifest, { ...actor.intent, speech: '现在发言。' }).variantIds, speaking.request.variantIds)
  presenter.sample(actor, manifest, 1)
  const interrupted = presenter.sample({ ...actor, intent: { ...actor.intent, speech: '现在发言。' } }, manifest, 0)
  assert.equal(interrupted.actions[0].clock.elapsedMs, 0)
  assert.equal(presenter.sample(actor, manifest, 0).actions[0].clock.elapsedMs, 0)
})

test('leisure is view-only, does not reserve resources or alter tasks, and yields to real actions immediately', t => {
  const runtime = createOfficeRuntime({ referenceLayout: true }), presentation = createOfficePresentation()
  t.after(() => runtime.dispose())
  const before = runtime.snapshot()
  assert(presentation.projectActors(runtime).every(actor => actor.intent.actionId === 'core.leisure' && actor.status === 'idle'))
  assert.deepEqual(runtime.snapshot(), before)
  const actorId = runtime.readActors()[0].id
  runtime.submit({ protocolVersion: '2.0', sceneId: runtime.sceneId, commandId: 'talk', type: 'activity.start', capability: 'scene.say', participants: [{ entityId: actorId, role: 'actor' }], params: { text: '收到新任务。', durationMs: 500 } })
  assert.equal(presentation.projectActors(runtime).find(actor => actor.id === actorId).intent.actionId, 'core.idle')
  for (let i = 0; i < 20; i++) runtime.tick(50)
  assert.equal(presentation.projectActors(runtime).find(actor => actor.id === actorId).intent.actionId, 'core.leisure')
  runtime.submit({ protocolVersion: '2.0', sceneId: runtime.sceneId, commandId: 'work', type: 'actor.presentation.set', actorId, sourceRevision: 1, status: 'working', title: '业务任务' })
  assert.equal(presentation.projectActors(runtime).find(actor => actor.id === actorId).intent.actionId, 'office.type')
  assert(runtime.snapshot().resources.every(resource => !resource.holders.length))
})

test('leisure never replaces a person waiting for a movement or listening in an active conversation', t => {
  const runtime = createOfficeRuntime({ referenceLayout: true }), presentation = createOfficePresentation()
  t.after(() => runtime.dispose())
  const world = runtime.readWorld(), actor = world.actors[0]
  const preview = { ...world, actors: [{ ...actor, posture: 'standing', motion: { path: [{ x: 4, y: 7 }], index: 0, waiting: true } }] }
  assert.notEqual(presentation.projectActors(runtime, preview)[0].intent.actionId, 'core.leisure')
  runtime.submit({ protocolVersion: '2.0', sceneId: runtime.sceneId, commandId: 'visit', type: 'activity.start', capability: 'office.visit',
    participants: [{ entityId: actor.id, role: 'visitor' }, { entityId: world.actors[1].id, role: 'host' }], params: { stops: [{ hostId: world.actors[1].id, message: '核对一下。' }], durationMs: 500 } })
  for (let i = 0; i < 800 && runtime.getRecord('visit').status === 'running'; i++) {
    runtime.tick(50)
    if (!runtime.readActivePhases().length) break
    for (const person of presentation.projectActors(runtime).filter(person => [actor.id, world.actors[1].id].includes(person.id))) assert.notEqual(person.intent.actionId, 'core.leisure')
  }
})
