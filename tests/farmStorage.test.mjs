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
  assert.deepEqual(readFarmSave(), { clockMs: 0, checkpoint: undefined, error: '' })
  const clock = createFarmClock(1234), runtime = createSceneRuntime(createFarmScenePack(clock.now)); t.after(() => runtime.dispose())
  farmPersistence(clock, undefined).save(runtime.checkpoint())
  const valid = raw, restored = readFarmSave()
  assert.equal(restored.clockMs, 1234); assert.equal(restored.error, '')
  for (const corrupt of ['{', 'null', { version: 1, clockMs: -1, checkpoint: {} }, ...['missing', 'state', 'null'].map(kind => {
    const save = JSON.parse(valid)
    if (kind === 'missing') save.checkpoint.world.props.pop()
    else if (kind === 'state') save.checkpoint.world.props[0].state = { crop: 'unknown' }
    else save.checkpoint.records = [null]
    return save
  })]) {
    raw = typeof corrupt === 'string' ? corrupt : JSON.stringify(corrupt)
    const before = raw, save = readFarmSave()
    assert(save.error); assert.equal(save.checkpoint, undefined); assert.equal(raw, before)
  }
  raw = valid
  for (const checkpoint of [null, { value: null }, { value: NaN }, { values: [undefined] }]) {
    assert.throws(() => farmPersistence(clock, checkpoint).load())
    assert.throws(() => farmPersistence(clock, undefined).save(checkpoint))
    assert.equal(raw, valid)
  }
  assert.throws(() => farmPersistence({ now: () => NaN }, undefined).save(runtime.checkpoint()))
  assert.equal(writes, 1)
})

test('farm ignores retired storage and rejects old envelopes instead of migrating layouts', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { farmStorageKey, readFarmSave, farmPersistence } = await server.ssrLoadModule('/example/farm/src/storage.ts')
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage })
  const clock = createFarmClock(5000), runtime = createSceneRuntime(createFarmScenePack(clock.now)); t.after(() => runtime.dispose())
  const checkpoint = runtime.checkpoint()
  checkpoint.world.props[0].state = { crop: 'tomato', plantedAt: 10, wateredAt: 20 }
  checkpoint.world.props.at(-1).state.tomato = 18
  const retiredKey = 'pixoffice:farm:v1'
  const raw = JSON.stringify({ version: 1, clockMs: clock.now(), checkpoint }), values = new Map([[retiredKey, raw]]), reads = []
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => { reads.push(key); return values.get(key) ?? null }, setItem: (key, value) => values.set(key, value),
  } })
  assert.equal(farmStorageKey, 'pixoffice:farm:v3')
  assert.deepEqual(readFarmSave(), { clockMs: 0, checkpoint: undefined, error: '' })
  assert.equal(reads.includes(retiredKey), false)
  for (const envelope of [{ version: 1, layoutVersion: 1 }, { version: 2, layoutVersion: 1 }, { version: 2 }]) {
    const content = JSON.stringify({ ...envelope, clockMs: clock.now(), checkpoint })
    values.set(farmStorageKey, content)
    assert(readFarmSave().error)
    assert.equal(values.get(farmStorageKey), content)
  }
  farmPersistence(clock, undefined).save(checkpoint)
  const restored = readFarmSave()
  assert.equal(restored.error, '')
  assert.deepEqual(restored.checkpoint, checkpoint)
  assert.equal(values.get(retiredKey), raw)
  assert.deepEqual([...values.keys()].sort(), [farmStorageKey, retiredKey].sort())
})
