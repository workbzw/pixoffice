import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'

test('cached character manifests validate the requested ID on every read', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { createCharacterResources } = await server.ssrLoadModule('@pixoffice/animation-frame/resources')
  const manifest = { id: 'alpha' }, portrait = { image: 'portrait.webp', canvas: { width: 8, height: 8 }, referenceHeight: 8 }
  const registry = { schemaVersion: 1, characters: ['alpha', 'beta'].map(id => ({ id, label: id,
    manifest: 'alpha/manifest-0000000000000000.json', clips: ['idle.front'], portrait })) }
  let manifestReads = 0
  t.mock.method(globalThis, 'fetch', async url => ({ ok: true, json: async () => {
    if (url.endsWith('/registry.json')) return registry
    manifestReads++; return manifest
  } }))
  const resources = createCharacterResources({ parseManifest: value => value })
  resources.configureCharacterResources('https://assets.test/characters')
  assert.equal((await resources.readCharacterManifest('alpha')).manifest.id, 'alpha')
  await assert.rejects(resources.readCharacterManifest('beta'), /ID mismatch: beta/)
  assert.equal((await resources.readCharacterManifest('alpha')).manifest.id, 'alpha')
  assert.equal(manifestReads, 1, 'a mismatched registry entry cannot invalidate the correctly cached manifest')
})

test('a direct manifest URL cannot replace another character or leak its resource lease', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { createCharacterResources } = await server.ssrLoadModule('@pixoffice/animation-frame/resources')
  const { ResourceLeaseCache } = await server.ssrLoadModule('@pixoffice/animation-frame/resources/ResourceLeaseCache')
  const goodUrl = 'https://assets.test/alpha/manifest.json', badUrl = 'https://assets.test/beta/manifest.json'
  const good = { manifest: { id: 'alpha' } }, bad = { manifest: { id: 'beta' } }, released = []
  t.mock.method(ResourceLeaseCache.prototype, 'acquire', async url => ({ value: url === goodUrl ? good : bad, release: () => released.push(url) }))
  t.mock.method(ResourceLeaseCache.prototype, 'get', url => url === goodUrl ? good : bad)
  const resources = createCharacterResources({ parseManifest: value => value })
  const lease = await resources.characterAssets.acquire('alpha', goodUrl); t.after(() => lease.release())
  await assert.rejects(resources.characterAssets.acquire('alpha', badUrl), /ID mismatch: alpha/)
  assert.deepEqual(released, [badUrl])
  assert.equal(resources.getCharacterPack('alpha'), good)
})
