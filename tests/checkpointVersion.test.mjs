import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'
import { base, visit } from './helpers/grid.mjs'
import { beginMapEdit, editMapDraft } from './helpers/map.mjs'

let server, createOfficeRuntime
before(async () => {
  server = await createTestServer()
  ;({ createOfficeRuntime } = await server.ssrLoadModule('/example/office-web/src/application/createOfficeRuntime.ts'))
})
after(() => server?.close())

function checkpoint(t) {
  const runtime = createOfficeRuntime()
  t.after(() => runtime.dispose())
  return runtime.checkpoint()
}

test('only current checkpoint and command versions restore; obsolete data is never converted or overwritten', t => {
  for (const change of [
    saved => { saved.version = 1 },
    saved => { delete saved.activeActivities },
    saved => { saved.records = [{ command: { ...visit('old-command'), protocolVersion: '1.0' }, status: 'completed', acceptedAt: 100 }] },
    saved => { saved.records = [{ command: { ...base('old-layout'), type: 'layout.apply', expectedLayoutRevision: 0, placements: [] }, status: 'completed', acceptedAt: 100 }] },
  ]) {
    const saved = checkpoint(t)
    change(saved)
    const original = structuredClone(saved)
    let writes = 0, backups = 0
    const runtime = createOfficeRuntime({ persistence: {
      load: () => saved, save: () => { writes++ }, replaceWithBackup: () => { backups++ },
    } })
    t.after(() => runtime.dispose())
    assert(runtime.snapshot().persistenceError)
    assert.equal(runtime.submit(visit()).error.code, 'PERSISTENCE_FAILED')
    assert.equal(writes, 0)
    assert.equal(backups, 0)
    assert.deepEqual(saved, original)
  }
})

test('current checkpoints restore names, board content and command history without a migration or backup', t => {
  const original = createOfficeRuntime()
  t.after(() => original.dispose())
  original.submit({ ...base('board'), type: 'object.state.set', entityId: 'whiteboard-1', expectedStateRevision: 0, state: { title: '当前议题', text: '当前内容' } })
  const saved = original.checkpoint()
  saved.world.actors[0].name = '自定义姓名'
  let writes = 0
  const runtime = createOfficeRuntime({ persistence: { load: () => saved, save: () => { writes++ } } })
  t.after(() => runtime.dispose())
  assert.equal(runtime.snapshot().persistenceError, undefined)
  assert.equal(runtime.readActors()[0].name, '自定义姓名')
  assert.deepEqual(runtime.readWorld().props, saved.world.props)
  assert.deepEqual(runtime.getRecord('board'), saved.records[0])
  assert.equal(writes, 0)
})

test('new spatial commands continue to reject fractional cells and obsolete protocol versions', t => {
  const runtime = createOfficeRuntime()
  t.after(() => runtime.dispose())
  assert.equal(beginMapEdit(runtime, 'draft').status, 'completed')
  const prop = runtime.editorSnapshot().document.props[0]
  prop.position.x += .5
  assert.equal(editMapDraft(runtime, 'fractional', { action: 'patch', operations: [{ op: 'prop.put', prop }] }).error.code, 'INVALID_COMMAND')
  assert.equal(runtime.submit({ ...base('retired-layout'), type: 'layout.apply', expectedLayoutRevision: 0, placements: [] }).error.code, 'INVALID_COMMAND')
  assert.equal(runtime.submit({ ...visit(), protocolVersion: '1.0' }).error.code, 'INVALID_COMMAND')
  assert.equal(runtime.describe().unit, 'cell')
  assert.equal(runtime.exportMap().version, 2)
  assert.equal(typeof runtime.setEditing, 'undefined')
})
