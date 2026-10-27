import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'

let server, createCivicEnvironment, civicScenePack, civicEntryUrl, referenceOfficeScenePack, sceneStorageKey
before(async () => {
  server = await createTestServer()
  ;({ createCivicEnvironment, civicScenePack, civicEntryUrl } = await server.ssrLoadModule('/example/office-web/src/civic/environment.ts'))
  ;({ referenceOfficeScenePack } = await server.ssrLoadModule('@pixoffice/scene-office/core'))
  ;({ sceneStorageKey } = await server.ssrLoadModule('@pixoffice/runtime/adapters/storage'))
})
after(async () => { await server?.close() })

function storage() {
  const values = new Map()
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}

test('civic scene reuses office geometry, actor identities and all office interactions', t => {
  assert.equal(civicScenePack.manifest.id, 'pixoffice.civic')
  assert.deepEqual(civicScenePack.createWorld('one'), referenceOfficeScenePack.createWorld('one'))
  assert.equal(civicScenePack.plugins, referenceOfficeScenePack.plugins)
  const environment = createCivicEnvironment(storage())
  const runtime = environment.createRuntime('one', false)
  t.after(() => runtime.dispose())
  assert.equal(runtime.sceneId, 'one')
  assert.equal(runtime.readActors().length, 6)
  assert(runtime.describe().plugins.some(plugin => plugin.capabilities.includes('office.visit')))
})

test('civic directory, runtime and chat saves do not overwrite ordinary office data', t => {
  const saved = storage(), environment = createCivicEnvironment(saved)
  const classic = sceneStorageKey('one')
  saved.setItem(classic, 'ordinary-office-save')
  saved.setItem('pixoffice:classic:demo-offices:v1', 'ordinary-directory')
  environment.storage.setItem('pixoffice:classic:demo-offices:v1', 'civic-directory')
  assert.equal(saved.getItem('pixoffice:classic:demo-offices:v1'), 'ordinary-directory')
  assert.equal(environment.storage.getItem('pixoffice:classic:demo-offices:v1'), 'civic-directory')
  assert.notEqual(environment.chatKey('preview'), 'preview')
  const runtime = environment.createRuntime('one', true)
  t.after(() => runtime.dispose())
  const result = runtime.submit({ protocolVersion: '2.0', sceneId: 'one', commandId: 'save', type: 'actor.presentation.set',
    actorId: 'office-lead', sourceRevision: 1, status: 'working', title: '公务场景任务' })
  assert.equal(result.status, 'completed')
  assert.equal(saved.getItem(classic), 'ordinary-office-save')
  assert(saved.getItem(sceneStorageKey('one', 'civic')))
})

test('civic defaults to members while preserving explicit layouts and deployment URLs', () => {
  assert.equal(civicEntryUrl('https://test.invalid/preview/civic/?candidate=abc#scene').href,
    'https://test.invalid/preview/civic/?candidate=abc&shell=members#scene')
  for (const shell of ['classic', 'members']) assert.equal(civicEntryUrl(`https://test.invalid/civic/?shell=${shell}`).search, `?shell=${shell}`)
  assert.equal(civicEntryUrl('https://test.invalid/civic/?shell=unknown').search, '?shell=members')
})
