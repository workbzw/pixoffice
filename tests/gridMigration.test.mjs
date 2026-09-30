import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'
import { base, visit, completed } from './helpers/grid.mjs'
let server, createOfficeRuntime
before(async () => {
  server = await createTestServer()
  ;({ createOfficeRuntime } = await server.ssrLoadModule('/src/runtime/createOfficeRuntime.ts'))
})
after(() => server?.close())
function legacy() {
  const saved = createOfficeRuntime().checkpoint()
  saved.version = 1; delete saved.world.unit
  saved.world.width = 960; saved.world.height = 640; saved.world.gridSize = 10
  saved.world.layoutRevision = 21
  saved.world.bounds = { left: 160, top: 175, right: 820, bottom: 580 }
  delete saved.pluginVersions['scene.furniture']
  saved.world.props.forEach((p, i) => { p.position = i < 6 ? { x: 380 + i % 2 * 200, y: 200 + Math.floor(i / 2) * 140 } : { x: 270, y: 330 } })
  saved.world.actors.forEach((a, i) => { a.position = { x: saved.world.props[i].position.x, y: saved.world.props[i].position.y + 45 }; delete a.using })
  saved.world.actors[0].name = '保留名字'
  saved.world.props.at(-1).state.text = '保留业务内容'
  saved.records = [{ command: { ...base('history'), protocolVersion: '1.0', type: 'layout.apply', expectedLayoutRevision: 20, placements: [] }, status: 'completed', acceptedAt: 100 }]
  return saved
}
test('v1 checkpoints migrate to integer cells with an exact backup and retained history', () => {
  const original = legacy()
  let stored = structuredClone(original), backup, replacements = 0
  const persistence = { load: () => stored, save: value => { stored = structuredClone(value) }, replaceWithBackup(expected, next) {
    assert.deepEqual(expected, stored); backup = structuredClone(stored); stored = structuredClone(next); replacements++
  } }
  const r = createOfficeRuntime({ persistence })
  assert.equal(r.snapshot().persistenceError, undefined)
  assert.equal(replacements, 1); assert.deepEqual(backup, original)
  assert.equal(stored.version, 2); assert.equal(r.readWorld().unit, 'cell'); assert.equal(r.readWorld().gridSize, 1)
  assert.equal(r.readWorld().layoutRevision, 22)
  assert.equal(r.readActors()[0].name, '保留名字')
  assert.equal(r.readWorld().props.at(-1).state.text, '保留业务内容')
  assert.deepEqual(r.getRecord('history'), original.records[0])
  assert(r.readWorld().props.every(p => Number.isInteger(p.position.x) && Number.isInteger(p.position.y)))
  r.submit(visit()); completed(r, 'visit')
  const reloaded = createOfficeRuntime({ persistence })
  assert.equal(reloaded.snapshot().persistenceError, undefined)
  assert.equal(replacements, 1, 'v2 reload does not migrate or replace its backup')
  assert.deepEqual(backup, original)
})
test('migration cannot overwrite storage when backup is missing or fails', () => {
  for (const backup of [undefined, () => { throw new Error('backup unavailable') }]) {
    const original = legacy(); let writes = 0
    const r = createOfficeRuntime({ persistence: { load: () => original, save: () => { writes++ }, replaceWithBackup: backup } })
    assert(r.snapshot().persistenceError)
    assert.equal(r.submit(visit()).error.code, 'PERSISTENCE_FAILED')
    assert.equal(writes, 0); assert.equal(original.version, 1)
  }
})
test('new spatial commands reject fractional cells and old protocol versions', () => {
  const r = createOfficeRuntime(), world = r.readWorld()
  const command = { ...base('layout'), type: 'layout.apply', expectedLayoutRevision: 0, placements: world.props.map(p => ({ entityId: p.id, position: p.position })) }
  command.placements[0].position.x += .5
  assert.equal(r.submit(command).error.code, 'INVALID_COMMAND')
  assert.equal(r.submit({ ...visit(), protocolVersion: '1.0' }).error.code, 'INVALID_COMMAND')
  assert.equal(r.describe().unit, 'cell')
  assert.equal(r.exportMap().version, 2)
})
