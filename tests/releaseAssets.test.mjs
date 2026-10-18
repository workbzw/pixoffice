import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { collectReleaseAssets, releaseAssetsPlugin } from '../scripts/assets/release.mjs'
import { readAssetCatalogFiles } from '../scripts/assets/export-pack.mjs'

const root = fileURLToPath(new URL('../public', import.meta.url))

test('website release only includes current catalogs, live fallbacks and selected branding', async () => {
  const files = await collectReleaseAssets(root)
  for (const name of ['brand/logo.png', 'brand/title.png', 'site/office-scene.webp', 'LICENSE.txt', 'THIRD_PARTY_NOTICES.txt',
    'pixoffice-config.js', 'characters/registry.json', 'assets/office/reference-v1/room-whiteboard-v3.png',
    'classroom-assets/roster.json', 'farm-assets/chickens.webp']) assert(files.has(name), name)
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
  assert(![...office.keys()].some(name => /^(farm|classroom)-assets\//.test(name)))
  for (const product of ['classroom', 'farm']) {
    const files = await collectReleaseAssets(root, product)
    assert([...files.keys()].every(name => name === 'pixoffice-config.js' || name.startsWith(`${product}-assets/`)))
    const catalog = JSON.parse(files.get(`${product}-assets/asset-pack.json`))
    assert.equal(files.size, catalog.files.length + 2)
  }
  await assert.rejects(collectReleaseAssets(root, 'unknown'), /Unknown release product/)
})

test('release catalogs fail closed on changed resources and the Vite plugin disables public directory copying', async () => {
  const catalog = JSON.parse(await readFile(`${root}/asset-packs/office-furniture.json`, 'utf8'))
  catalog.files[0].sha256 = '0'.repeat(64)
  await assert.rejects(readAssetCatalogFiles(root, catalog), /revision mismatch/)
  const plugin = releaseAssetsPlugin()
  assert.equal(plugin.apply, 'build')
  assert.equal(plugin.config().build.copyPublicDir, false)
})
