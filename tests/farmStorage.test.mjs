import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSceneRuntime } from '@pixoffice/runtime'
import { createFarmScenePack, createFarmClock } from '@pixoffice/scene-farm'
import { createTestServer } from './helpers/vite.mjs'

test('farm saves clock and checkpoint together; corrupt content is preserved in temporary mode', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { farmStorageKey, readFarmSave, farmPersistence } = await server.ssrLoadModule('/example/farm/src/storage.ts')
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage })
  let raw = null, writes = 0
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem(key) { assert.equal(key, farmStorageKey); return raw },
    setItem(key, value) { assert.equal(key, farmStorageKey); writes++; raw = value },
  } })
  assert.deepEqual(readFarmSave(), { clockMs: 0, checkpoint: null, error: '' })
  const clock = createFarmClock(1234), runtime = createSceneRuntime(createFarmScenePack(clock.now)); t.after(() => runtime.dispose())
  farmPersistence(clock, null).save(runtime.checkpoint())
  const valid = raw, restored = readFarmSave()
  assert.equal(restored.clockMs, 1234); assert.equal(restored.error, '')
  for (const corrupt of ['{', { version: 1, clockMs: -1, checkpoint: {} }, ...['missing', 'state'].map(kind => {
    const save = JSON.parse(valid)
    if (kind === 'missing') save.checkpoint.world.props.pop()
    else save.checkpoint.world.props[0].state = { crop: 'unknown' }
    return save
  })]) {
    raw = typeof corrupt === 'string' ? corrupt : JSON.stringify(corrupt)
    const before = raw, save = readFarmSave()
    assert(save.error); assert.equal(save.checkpoint, null); assert.equal(raw, before)
  }
  assert.equal(writes, 1)
})

test('enlarged farm layout migrates old saves without losing crops, inventory or history and backs up the original', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { farmStorageKey, farmLegacyBackupKey, readFarmSave, farmPersistence } = await server.ssrLoadModule('/example/farm/src/storage.ts')
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage })
  const clock = createFarmClock(5000), runtime = createSceneRuntime(createFarmScenePack(clock.now)); t.after(() => runtime.dispose())
  const checkpoint = runtime.checkpoint(), expected = structuredClone(checkpoint.world)
  checkpoint.world.props.filter(p => p.templateId === 'farm.plot').forEach((p, i) => { p.position = { x: [5, 10, 15][i % 3], y: i < 3 ? 5 : 10 } })
  checkpoint.world.props[0].state = { crop: 'tomato', plantedAt: 10, wateredAt: 20 }
  checkpoint.world.props.at(-1).state.tomato = 18
  checkpoint.world.actors[0].position = { x: 6, y: 7 }
  const raw = JSON.stringify({ version: 1, clockMs: clock.now(), checkpoint }), values = new Map([[farmStorageKey, raw]])
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value),
  } })
  const migrated = readFarmSave()
  assert.equal(migrated.error, ''); assert.equal(migrated.clockMs, 5000)
  assert.equal(values.get(farmStorageKey), raw)
  assert.deepEqual(migrated.checkpoint.world.props.map(p => p.position), expected.props.map(p => p.position))
  assert.deepEqual(migrated.checkpoint.world.actors.map(p => p.position), expected.actors.map(p => p.position))
  assert.deepEqual(migrated.checkpoint.world.props[0].state, checkpoint.world.props[0].state)
  assert.equal(migrated.checkpoint.world.props.at(-1).state.tomato, 18)
  assert.deepEqual(migrated.checkpoint.records, checkpoint.records)
  values.set(farmStorageKey, JSON.stringify({ version: 2, clockMs: clock.now(), checkpoint }))
  assert.deepEqual(readFarmSave().checkpoint.world.props.map(p => p.position), expected.props.map(p => p.position))
  values.set(farmStorageKey, raw)
  const persistence = farmPersistence(clock, migrated.checkpoint)
  const restored = createSceneRuntime(createFarmScenePack(clock.now), { persistence }); t.after(() => restored.dispose())
  assert.equal(restored.snapshot().persistenceError, undefined)
  persistence.save(restored.checkpoint())
  assert.equal(values.get(farmLegacyBackupKey), raw)
  const saved = JSON.parse(values.get(farmStorageKey)); assert.equal(saved.version, 2); assert.equal(saved.layoutVersion, 2)
  assert.equal(saved.checkpoint.world.props.at(-1).state.tomato, 18)
  assert.equal(readFarmSave().checkpoint.world.layoutRevision, saved.checkpoint.world.layoutRevision)
})
