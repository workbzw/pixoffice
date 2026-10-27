import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'

test('cached character manifests validate the requested ID on every read', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { createCharacterResources } = await server.ssrLoadModule('@pixoffice/animation-frame/resources')
  const manifest = { id: 'alpha' }, portrait = { image: 'portrait.webp', canvas: { width: 8, height: 8 }, referenceHeight: 8 }
  const registry = { schemaVersion: 1, characters: ['alpha', 'beta'].map(id => ({ id, label: id,
    manifest: 'alpha/manifest-0000000000000000.json', clips: ['idle.front'], portrait })) }
  let manifestReads = 0
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.endsWith('/registry.json')) return Response.json(registry)
    manifestReads++; return Response.json(manifest)
  })
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

function registryWithRevision(revision, ids = ['alpha']) {
  return { schemaVersion: 1, characters: ids.map(id => ({ id, label: id,
    manifest: `${id}/manifest-${revision}.json`, clips: ['idle.front'],
    portrait: { image: `${id}/portrait.webp`, canvas: { width: 8, height: 8 }, referenceHeight: 8 } })) }
}

for (const missing of ['html', '404', '410']) test(`a stale character registry refreshes once after a ${missing} manifest response`, async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { createCharacterResources } = await server.ssrLoadModule('@pixoffice/animation-frame/resources')
  const oldRevision = '0000000000000000', newRevision = '1111111111111111'
  let registryReads = 0
  const urls = [], cacheModes = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    urls.push(url)
    if (url.endsWith('/registry.json')) {
      cacheModes.push(options?.cache)
      return Response.json(registryWithRevision(registryReads++ === 0 ? oldRevision : newRevision))
    }
    if (url.includes(oldRevision)) return new Response('<!doctype html><title>Website</title>', {
      status: missing === 'html' ? 200 : Number(missing), headers: { 'content-type': 'text/html' },
    })
    return Response.json({ id: 'alpha' })
  })
  const resources = createCharacterResources({ parseManifest: value => value })
  resources.configureCharacterResources('https://assets.test/characters')
  const result = await resources.readCharacterManifest('alpha')
  assert.equal(result.manifest.id, 'alpha')
  assert.equal(result.url, `https://assets.test/characters/alpha/manifest-${newRevision}.json`)
  assert.equal(registryReads, 2)
  assert.deepEqual(cacheModes, ['no-cache', 'no-cache'])
  assert.equal((await resources.readCharacterManifest('alpha')).url, result.url)
  assert.equal(urls.length, 4, 'the current registry and manifest remain cached after recovery')
})

test('concurrent stale manifests share one registry refresh', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { createCharacterResources } = await server.ssrLoadModule('@pixoffice/animation-frame/resources')
  let registryReads = 0
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.endsWith('/registry.json')) return Response.json(registryWithRevision(
      registryReads++ === 0 ? '0000000000000000' : '1111111111111111', ['alpha', 'beta']))
    if (url.includes('0000000000000000')) return new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } })
    return Response.json({ id: url.includes('/alpha/') ? 'alpha' : 'beta' })
  })
  const resources = createCharacterResources({ parseManifest: value => value })
  resources.configureCharacterResources('https://assets.test/characters')
  const results = await Promise.all(['alpha', 'beta'].map(id => resources.readCharacterManifest(id)))
  assert.deepEqual(results.map(result => result.manifest.id), ['alpha', 'beta'])
  assert.equal(registryReads, 2)
})

test('an unchanged missing manifest reports its URL without an infinite retry', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { createCharacterResources } = await server.ssrLoadModule('@pixoffice/animation-frame/resources')
  const urls = []
  t.mock.method(globalThis, 'fetch', async url => {
    urls.push(url)
    return url.endsWith('/registry.json') ? Response.json(registryWithRevision('0000000000000000'))
      : new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } })
  })
  const resources = createCharacterResources({ parseManifest: value => value })
  resources.configureCharacterResources('https://assets.test/characters')
  await assert.rejects(resources.readCharacterManifest('alpha'), /alpha\/manifest-0000000000000000\.json: expected JSON but received an HTML page/)
  assert.equal(urls.length, 3, 'one manifest attempt and one registry revalidation')
})

test('invalid JSON does not switch to a different resource revision', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { createCharacterResources } = await server.ssrLoadModule('@pixoffice/animation-frame/resources')
  let registryReads = 0
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.endsWith('/registry.json')) { registryReads++; return Response.json(registryWithRevision('0000000000000000')) }
    return new Response('{invalid', { headers: { 'content-type': 'application/json' } })
  })
  const resources = createCharacterResources({ parseManifest: value => value })
  resources.configureCharacterResources('https://assets.test/characters')
  await assert.rejects(resources.readCharacterManifest('alpha'), /alpha\/manifest-0000000000000000\.json: invalid JSON response/)
  assert.equal(registryReads, 1)
})

test('manifest schema failures are not treated as a stale URL', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { createCharacterResources } = await server.ssrLoadModule('@pixoffice/animation-frame/resources')
  let registryReads = 0
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.endsWith('/registry.json')) { registryReads++; return Response.json(registryWithRevision('0000000000000000')) }
    return Response.json({ id: 'alpha', invalid: true })
  })
  const failure = new Error('Invalid frame schema')
  const resources = createCharacterResources({ parseManifest: () => { throw failure } })
  resources.configureCharacterResources('https://assets.test/characters')
  await assert.rejects(resources.readCharacterManifest('alpha'), failure)
  assert.equal(registryReads, 1)
})

test('an explicit external manifest URL never falls back to a local character with the same ID', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { createCharacterResources } = await server.ssrLoadModule('@pixoffice/animation-frame/resources')
  const urls = []
  t.mock.method(globalThis, 'fetch', async url => {
    urls.push(url)
    return new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } })
  })
  const resources = createCharacterResources({ parseManifest: value => value })
  resources.configureCharacterResources('https://local.test/characters')
  const external = 'https://external.test/alpha/manifest.json'
  await assert.rejects(resources.characterAssets.acquire('alpha', external), /external\.test\/alpha\/manifest\.json: expected JSON/)
  assert.deepEqual(urls, [external])
})

test('real HTTP recovery handles an HTML SPA fallback for a removed content hash', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { createCharacterResources } = await server.ssrLoadModule('@pixoffice/animation-frame/resources')
  let registryReads = 0
  const http = createServer((request, response) => {
    if (request.url === '/characters/registry.json') {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify(registryWithRevision(registryReads++ === 0 ? '0000000000000000' : '1111111111111111')))
    } else if (request.url.includes('0000000000000000')) {
      response.setHeader('content-type', 'text/html; charset=utf-8')
      response.end('<!doctype html><title>Website</title>')
    } else {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ id: 'alpha' }))
    }
  })
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => { http.closeAllConnections(); http.close(resolve) }))
  const resources = createCharacterResources({ parseManifest: value => value })
  resources.configureCharacterResources(`http://127.0.0.1:${http.address().port}/characters`)
  await resources.loadCharacterRegistry()
  assert.equal((await resources.readCharacterManifest('alpha')).manifest.id, 'alpha')
  assert.equal(registryReads, 2)
})
