import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectReleaseAssets, releaseAssetsPlugin } from '../scripts/assets/release.mjs'
import { readAssetCatalogFiles } from '../scripts/assets/export-pack.mjs'

const root = fileURLToPath(new URL('../public', import.meta.url))

test('website release only includes current catalogs, live fallbacks and selected branding', async () => {
  const files = await collectReleaseAssets(root)
  for (const name of ['brand/logo.png', 'brand/title.png', 'site/office-scene.webp', 'LICENSE.txt', 'THIRD_PARTY_NOTICES.txt',
    'pixoffice-config.js', 'characters/registry.json', 'assets/office/reference-v1/room-whiteboard-v3.png',
    'classroom-assets/roster.json', 'farm-assets/chickens.webp', 'site/civic-preview.webp',
    'civic-assets/characters/registry.json', 'civic-assets/audit.json']) assert(files.has(name), name)
  for (const name of files.keys()) {
    assert(!name.startsWith('assets/characters/'), name)
    assert(!/README|prompts|room-rounded-v2|whiteboard-rounded-v2|\.DS_Store/.test(name), name)
  }
  const registry = JSON.parse(files.get('characters/registry.json'))
  const allowed = new Set(['characters/registry.json'])
  for (const character of registry.characters) {
    const catalog = JSON.parse(await readFile(`${root}/asset-packs/${character.id}.json`, 'utf8'))
    for (const file of catalog.files) allowed.add(file.path)
  }
  assert.deepEqual([...files.keys()].filter(name => name.startsWith('characters/')).sort(), [...allowed].sort())
})

test('standalone release selection cannot include another scene or historical generated files', async () => {
  const office = await collectReleaseAssets(root, 'office')
  assert(![...office.keys()].some(name => /^(farm|classroom|civic)-assets\//.test(name)))
  for (const product of ['classroom', 'farm']) {
    const files = await collectReleaseAssets(root, product)
    assert([...files.keys()].every(name => name === 'pixoffice-config.js' || name.startsWith(`${product}-assets/`)))
    const catalog = JSON.parse(files.get(`${product}-assets/asset-pack.json`))
    assert.equal(files.size, catalog.files.length + 2)
  }
  await assert.rejects(collectReleaseAssets(root, 'unknown'), /Unknown release product/)
})

test('civic ships a separate preview registry without claiming art approval', async () => {
  const files = await collectReleaseAssets(root)
  const audit = JSON.parse(files.get('civic-assets/audit.json'))
  assert.equal(audit.status, 'preview-only')
  assert.equal(audit.reports.length, 6)
  const registry = JSON.parse(files.get('civic-assets/characters/registry.json'))
  const officeRegistry = JSON.parse(files.get('characters/registry.json'))
  assert.equal(registry.characters.length, 6)
  for (const character of registry.characters) {
    const original = officeRegistry.characters.find(item => item.id === character.id)
    assert(original)
    assert(files.has(`civic-assets/characters/${character.manifest}`))
    assert(!files.get(`civic-assets/characters/${character.manifest}`).equals(files.get(`characters/${original.manifest}`)))
  }
})

test('generated civic assets contain no stale manifests, portraits or atlas hashes', async () => {
  const directory = path.join(root, 'civic-assets')
  const catalog = JSON.parse(await readFile(path.join(directory, 'asset-pack.json'), 'utf8'))
  const actual = (await readdir(directory, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile()).map(entry => path.relative(directory, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
  assert.deepEqual(actual.sort(), ['asset-pack.json', ...catalog.files.map(file => file.path)].sort())
})

test('release catalogs fail closed on changed resources and the Vite plugin disables public directory copying', async () => {
  const catalog = JSON.parse(await readFile(`${root}/asset-packs/office-furniture.json`, 'utf8'))
  catalog.files[0].sha256 = '0'.repeat(64)
  await assert.rejects(readAssetCatalogFiles(root, catalog), /revision mismatch/)
  const plugin = releaseAssetsPlugin()
  assert.equal(plugin.apply, 'build')
  assert.equal(plugin.config().build.copyPublicDir, false)
})
