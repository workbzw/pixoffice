import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createSceneRuntime } from '@pixoffice/runtime'
import { createFarmScenePack, createFarmClock, cropStatus, crops, farmRoster, tendFarm } from '@pixoffice/scene-farm'
import { createFarmPresentation } from '@pixoffice/scene-farm/pixi'
import { bindFarmFrames } from '@pixoffice/assets-farm'
import { CharacterManifestSchema } from '@pixoffice/animation-frame/packSchema'

function setup(t, options = {}, transform = pack => pack) {
  const clock = createFarmClock(), runtime = createSceneRuntime(transform(createFarmScenePack(clock.now)), options)
  t.after(() => runtime.dispose())
  const advance = (ms, fps = 20) => { for (let n = 0; n < ms; n += 1000 / fps) { clock.advance(1000 / fps); runtime.tick(1000 / fps) } }
  return { clock, runtime, advance }
}
const command = (runtime, id, operation, plotId = 'plot-1', farmer = 'farmer-1') => ({ protocolVersion: '2.0', sceneId: runtime.sceneId,
  commandId: id, type: 'activity.start', capability: `farm.${operation}`, participants: [{ entityId: farmer, role: 'farmer' }],
  params: { plotId, ...(operation === 'plant' ? { crop: 'carrot' } : {}) } })
const plot = (runtime, id = 'plot-1') => runtime.readWorld().props.find(p => p.id === id)
const inventory = runtime => plot(runtime, 'harvest-store').state
function finish(runtime, advance, ids) {
  for (let n = 0; n < 4000 && ids.some(id => ['running', 'queued'].includes(runtime.getRecord(id)?.status)); n++) advance(50)
  for (const id of ids) assert.equal(runtime.getRecord(id).status, 'completed', JSON.stringify(runtime.getRecord(id)))
}
function ready(runtime, id = 'plot-1', crop = 'carrot') {
  const p = plot(runtime, id)
  assert.equal(runtime.submit({ protocolVersion: '2.0', sceneId: runtime.sceneId, commandId: `seed-${id}`, type: 'object.state.set',
    entityId: id, expectedStateRevision: p.stateRevision, state: { crop, plantedAt: 0, wateredAt: 0 } }).status, 'completed')
}

test('farm is a headless peer scene with integer furniture and no office or classroom plugins', t => {
  const { runtime } = setup(t), world = runtime.readWorld()
  assert.equal(world.actors.length, 2); assert.equal(world.props.length, 7)
  assert.equal(world.props.filter(p => p.templateId === 'farm.plot').length, 6)
  assert(runtime.snapshot().plugins.every(p => !/^(office|classroom)\./.test(p.id)))
  for (const p of world.props) assert(Object.values(runtime.template(p.templateId).footprint).every(Number.isInteger))
})

test('paused wall time and accelerated crop growth do not expire farm execution deadlines', t => {
  let wallTime = 1000000, executionTime = wallTime
  t.mock.method(Date, 'now', () => wallTime)
  const { runtime, clock } = setup(t, { now: () => executionTime })
  const advance = ms => {
    for (let n = 0; n < ms; n += 50) if (clock.speed > 0) {
      executionTime += 50; clock.advance(50); runtime.tick(50)
    }
  }
  runtime.submit({ ...command(runtime, 'pause-test', 'plant'), timeoutMs: 20000 })
  advance(500)
  clock.setSpeed(0); wallTime += 300000; advance(300000)
  assert.equal(runtime.getRecord('pause-test').status, 'running')
  clock.setSpeed(4)
  finish(runtime, advance, ['pause-test'])
  assert.equal(plot(runtime).state.crop, 'carrot')
})

test('plant, water, grow and harvest commit real state exactly once', t => {
  const { runtime, clock, advance } = setup(t)
  runtime.submit(command(runtime, 'plant', 'plant')); assert.equal(plot(runtime).state.crop, null)
  finish(runtime, advance, ['plant']); assert.equal(cropStatus(plot(runtime).state, clock.now()).stage, 'thirsty')
  advance(50000); assert.equal(cropStatus(plot(runtime).state, clock.now()).progress, 0)
  runtime.submit(command(runtime, 'water', 'water')); finish(runtime, advance, ['water'])
  advance(crops.carrot.growthMs); assert.equal(cropStatus(plot(runtime).state, clock.now()).stage, 'ready')
  const harvest = command(runtime, 'harvest', 'harvest')
  runtime.submit(harvest); assert.equal(inventory(runtime).carrot, 0)
  finish(runtime, advance, ['harvest'])
  assert.equal(inventory(runtime).carrot, 3); assert.equal(plot(runtime).state.crop, null)
  assert.equal(runtime.submit(harvest).status, 'completed'); advance(5000)
  assert.equal(inventory(runtime).carrot, 3)
  assert(runtime.snapshot().resources.every(r => !r.holders.length))
})

for (const stage of ['walking', 'working']) test(`cancelling while ${stage} does not plant or reward`, t => {
  const { runtime, advance } = setup(t), start = command(runtime, 'plant', 'plant')
  runtime.submit(start)
  for (let n = 0; n < 1000; n++) {
    advance(50)
    if (stage === 'walking' ? runtime.readActors()[0].step : runtime.readActivePhases()[0]?.actions.length) break
  }
  runtime.submit({ protocolVersion: '2.0', sceneId: runtime.sceneId, commandId: 'cancel', type: 'command.cancel', targetCommandId: 'plant' })
  advance(3000); assert.equal(runtime.getRecord('plant').status, 'cancelled')
  assert.equal(plot(runtime).state.crop, null); assert.equal(inventory(runtime).carrot, 0)
})

test('different plots run concurrently, but a plot and shared harvest inventory serialize', t => {
  const { runtime, advance } = setup(t)
  assert.equal(runtime.submit(command(runtime, 'one', 'plant')).status, 'running')
  assert.equal(runtime.submit(command(runtime, 'two', 'plant', 'plot-2', 'farmer-2')).status, 'running')
  finish(runtime, advance, ['one', 'two'])
  ready(runtime, 'plot-1'); ready(runtime, 'plot-2'); advance(50000)
  assert.equal(runtime.submit(command(runtime, 'harvest-one', 'harvest')).status, 'running')
  assert.equal(runtime.submit(command(runtime, 'harvest-two', 'harvest', 'plot-2', 'farmer-2')).status, 'queued')
  finish(runtime, advance, ['harvest-one', 'harvest-two']); assert.equal(inventory(runtime).carrot, 6)
})

test('external state changes invalidate in-flight completion instead of overwriting', t => {
  const { runtime, advance } = setup(t)
  ready(runtime); advance(50000); runtime.submit(command(runtime, 'harvest', 'harvest'))
  const store = plot(runtime, 'harvest-store')
  runtime.submit({ protocolVersion: '2.0', sceneId: runtime.sceneId, commandId: 'external', type: 'object.state.set',
    entityId: store.id, expectedStateRevision: store.stateRevision, state: { carrot: 10, tomato: 0, cabbage: 0 } })
  advance(30000)
  assert.equal(runtime.getRecord('harvest').error.code, 'REVISION_CONFLICT')
  assert.equal(plot(runtime).state.crop, 'carrot'); assert.equal(inventory(runtime).carrot, 10)
})

test('completion validates every proposed state and resource before changing any object', t => {
  const { runtime, advance } = setup(t, {}, pack => ({ ...pack, plugins: pack.plugins.map(plugin => plugin.id !== 'farm.cultivation' ? plugin : {
    ...plugin, capabilities: plugin.capabilities.map(cap => cap.id !== 'farm.harvest' ? cap : { ...cap, complete(context, params) {
      const changes = cap.complete(context, params); changes[1].state.carrot = -1; return changes
    } }),
  }) }))
  ready(runtime); advance(50000); runtime.submit(command(runtime, 'harvest', 'harvest')); advance(30000)
  assert.equal(runtime.getRecord('harvest').status, 'failed')
  assert.equal(plot(runtime).state.crop, 'carrot'); assert.equal(inventory(runtime).carrot, 0)
})

test('completion cannot mutate a prop without reserving its resource', t => {
  const { runtime, advance } = setup(t, {}, pack => ({ ...pack, plugins: pack.plugins.map(plugin => plugin.id !== 'farm.cultivation' ? plugin : {
    ...plugin, capabilities: plugin.capabilities.map(cap => cap.id !== 'farm.plant' ? cap : { ...cap, complete(context, params) {
      const changes = cap.complete(context, params)
      changes.push({ entityId: 'harvest-store', expectedStateRevision: 0, state: { carrot: 99, tomato: 0, cabbage: 0 } })
      return changes
    } }),
  }) }))
  runtime.submit(command(runtime, 'plant', 'plant')); advance(30000)
  assert.equal(runtime.getRecord('plant').error.code, 'INVALID_PLAN')
  assert.equal(plot(runtime).state.crop, null); assert.equal(inventory(runtime).carrot, 0)
})

test('continuous activities cannot declare finite completion effects', t => {
  const { runtime } = setup(t, {}, pack => ({ ...pack, plugins: pack.plugins.map(plugin => plugin.id !== 'farm.cultivation' ? plugin : {
    ...plugin, capabilities: plugin.capabilities.map(cap => cap.id !== 'farm.plant' ? cap : { ...cap, build(context, params) { return { ...cap.build(context, params), continuous: true } } }),
  }) }))
  assert.equal(runtime.submit(command(runtime, 'plant', 'plant')).error.code, 'INVALID_PLAN')
  assert.equal(plot(runtime).state.crop, null)
})

test('failed durable completion keeps both crop and inventory unchanged', t => {
  let fail = false, saved
  const persistence = { load: () => undefined, save(checkpoint) { if (fail) throw new Error('disk full'); saved = structuredClone(checkpoint) } }
  const { runtime, advance } = setup(t, { persistence })
  ready(runtime); advance(50000); runtime.submit(command(runtime, 'harvest', 'harvest')); fail = true; advance(30000)
  assert.equal(runtime.getRecord('harvest').error.code, 'PERSISTENCE_FAILED')
  assert.equal(plot(runtime).state.crop, 'carrot'); assert.equal(inventory(runtime).carrot, 0)
  assert.equal(saved.world.props.find(p => p.id === 'plot-1').state.crop, 'carrot')
})

test('durable harvest survives restart and replay cannot reward twice', t => {
  let saved
  const persistence = { load: () => saved, save(checkpoint) { saved = structuredClone(checkpoint) } }
  const { runtime, advance, clock } = setup(t, { persistence })
  ready(runtime); advance(50000)
  const harvest = command(runtime, 'harvest', 'harvest'); runtime.submit(harvest); finish(runtime, advance, ['harvest'])
  const restored = createSceneRuntime(createFarmScenePack(clock.now), { persistence }); t.after(() => restored.dispose())
  assert.equal(restored.submit(harvest).status, 'completed'); restored.tick(1000)
  assert.equal(inventory(restored).carrot, 3); assert.equal(plot(restored).state.crop, null)
})

test('farm clocks pause, accelerate, and give the same growth at 30/60/120 fps', () => {
  const state = { crop: 'tomato', plantedAt: 0, wateredAt: 0 }
  for (const fps of [30, 60, 120]) {
    const clock = createFarmClock(); clock.setSpeed(0); clock.advance(500); assert.equal(clock.now(), 0)
    clock.setSpeed(4); for (let n = 0; n < fps * 4; n++) clock.advance(1000 / fps)
    assert(Math.abs(cropStatus(state, clock.now()).progress - .5) < 1e-10)
    assert.throws(() => clock.setSpeed(3))
  }
})

test('automatic care keeps both farmers useful and completes all three crops without collisions', t => {
  const { runtime, clock, advance } = setup(t); let id = 0, concurrent = false
  for (let n = 0; n < 6000; n++) {
    if (n % 5 === 0) tendFarm(runtime, clock.now(), () => `auto-${++id}`)
    advance(50)
    const world = runtime.readWorld()
    if (runtime.readActivePhases().length === 2) concurrent = true
    assert.notDeepEqual(world.actors[0].position, world.actors[1].position)
    for (const actor of world.actors) {
      if (actor.step) assert(actor.step.from.x === actor.step.to.x || actor.step.from.y === actor.step.to.y)
      for (const p of world.props) {
        const b = runtime.template(p.templateId).footprint, x = actor.position.x - p.position.x, y = actor.position.y - p.position.y
        assert(!(x >= b.left && x < b.right && y >= b.top && y < b.bottom), `${actor.id} crossed ${p.id}`)
      }
    }
  }
  assert(concurrent); assert(Object.values(inventory(runtime)).every(n => n > 0), JSON.stringify(inventory(runtime)))
  assert(!runtime.snapshot().records.some(r => r.status === 'failed'))
})

test('farm action projection uses explicit semantic actions and independent frame assets', async t => {
  const { runtime, advance, clock } = setup(t), presentation = createFarmPresentation('https://example.test/farm/', clock.now)
  const root = new URL('../public/farm-assets/farm-gardener/', import.meta.url)
  const visual = JSON.parse(await readFile(new URL('visual.json', root), 'utf8'))
  const manifest = CharacterManifestSchema.parse(JSON.parse(await readFile(new URL(visual.source.uri, root), 'utf8')))
  assert.deepEqual(bindFarmFrames(manifest, visual.source.uri), visual)
  assert.equal(manifest.profile, 'farm'); assert(!Object.keys(manifest.clips).some(c => /^(sit|work\.)/.test(c)))
  runtime.submit(command(runtime, 'plant', 'plant')); let sawWork = false, boundaries = 0
  for (let n = 0; n < 1000 && runtime.getRecord('plant').status === 'running'; n++) {
    advance(50)
    const actor = runtime.readActors()[0], projected = presentation.projectActors(runtime)[0]
    if (actor.motion && !actor.step && !actor.motion.waiting && actor.motion.index < actor.motion.path.length) { boundaries++; assert.equal(projected.intent.actionId, 'core.walk') }
    if (projected.intent.actionId === 'farm.plant') { sawWork = true; assert.equal(projected.intent.view, 'back'); assert(projected.intent.progress >= 0 && projected.intent.progress <= 1) }
    assert(visual.capabilities.variants.some(v => v.actionId === projected.intent.actionId && v.poseId === projected.intent.poseId && v.view === projected.intent.view))
  }
  assert(sawWork && boundaries > 0); assert.equal(farmRoster.length, 2)
})
