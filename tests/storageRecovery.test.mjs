import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'

let server, browserPersistence
before(async () => {
  server = await createTestServer()
  ;({ browserPersistence } = await server.ssrLoadModule('/packages/runtime/src/adapters/storage.ts'))
})
after(() => server?.close())

const key = 'pixoffice:classic:runtime:v2:office-1'
const raw = '{ "version": 2, "note": "keep exact original bytes" }'
function storageFixture(fail = () => false) {
  const values = new Map([[key, raw]])
  return { values, storage: {
    getItem: key => values.get(key) ?? null,
    setItem(key, value) { if (fail(key)) throw new Error('quota'); values.set(key, value) },
  } }
}

test('recovery backs up exact original bytes before replacing only this scene save', () => {
  const { storage, values } = storageFixture()
  values.set('unrelated', 'keep')
  const persistence = browserPersistence(storage, 'office-1')
  persistence.replaceWithBackup(JSON.parse(raw), { version: 2, recovered: true })
  const backups = [...values.entries()].filter(([name]) => name.startsWith(`${key}:backup:`))
  assert.equal(backups.length, 1)
  assert.equal(backups[0][1], raw)
  assert.equal(values.get('unrelated'), 'keep')
  assert.equal(persistence.load().recovered, true)
})

test('backup quota and replacement quota never destroy the active original save', () => {
  for (const failingKey of ['backup', 'active']) {
    const { storage, values } = storageFixture(keyToWrite => failingKey === 'active' ? keyToWrite === key : keyToWrite.includes(':backup:'))
    assert.throws(() => browserPersistence(storage, 'office-1').replaceWithBackup(JSON.parse(raw), { recovered: true }), /quota/)
    assert.equal(values.get(key), raw)
  }
})

test('a changed or missing original cannot be replaced by a stale recovery', () => {
  for (const state of ['changed', 'missing']) {
    const { storage, values } = storageFixture()
    if (state === 'changed') values.set(key, '{"newer":true}')
    else values.delete(key)
    const before = [...values]
    assert.throws(() => browserPersistence(storage, 'office-1').replaceWithBackup(JSON.parse(raw), { recovered: true }), /存档已被其他页面修改/)
    assert.deepEqual([...values], before)
  }
})

test('storage rejects null data on read and before writing or backing up a replacement', () => {
  const { storage, values } = storageFixture(), persistence = browserPersistence(storage, 'office-1')
  for (const checkpoint of [null, { value: null }, { value: NaN }, { values: [undefined] }, { values: Array(1) }]) {
    assert.throws(() => persistence.save(checkpoint))
    assert.throws(() => persistence.replaceWithBackup(JSON.parse(raw), checkpoint))
    assert.deepEqual([...values], [[key, raw]])
  }
  for (const source of ['null', '{"value":null}', '{"values":[null]}']) {
    values.set(key, source)
    assert.throws(() => persistence.load())
    assert.equal(values.get(key), source)
  }
  values.delete(key)
  assert.equal(persistence.load(), undefined)
  persistence.save({ version: 2, optional: undefined })
  assert.deepEqual(persistence.load(), { version: 2 })
})
