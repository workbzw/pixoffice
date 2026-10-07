import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'
import { CharacterSourceSchema } from '@pixoffice/animation-frame/packSchema'
import { CharacterSourceSchema as OfficeSource } from '@pixoffice/assets-office/frame/packSchema'
import { buildCharacters } from '../scripts/assets/build-character.mjs'
import { createAssetCatalog, exportAssetPack } from '../scripts/assets/export-pack.mjs'
import { createTestServer } from './helpers/vite.mjs'
const source = id => ({ schemaVersion: 1, id, label: id, profile: 'courtyard', canvas: { width: 16, height: 16 },
  pivot: { x: 8, y: 12 }, referenceHeight: 8, displayHeight: 40, portrait: 'custom.bounce',
  clips: { 'custom.bounce': { frames: [{ file: 'body.png', durationMs: 200 }], loop: true } } })
const temporary = async t => { const dir = await mkdtemp(path.join(tmpdir(), 'pixoffice-isolation-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir }

test('frame source accepts custom actions without office roles, walking or seating; office rules remain strict', () => {
  assert.equal(CharacterSourceSchema.parse(source('new-role')).profile, 'courtyard')
  assert.throws(() => OfficeSource.parse({ ...source('new-role'), profile: 'office' }))
})

test('generic character builder only publishes explicitly selected IDs and rejects unknown IDs before writing', async t => {
  const dir = await temporary(t), sources = path.join(dir, 'sources'), output = path.join(dir, 'output')
  const pixels = Buffer.alloc(16 * 16 * 4)
  for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) { const i = (y * 16 + x) * 4; pixels[i] = 180; pixels[i + 3] = 255 }
  const image = await sharp(pixels, { raw: { width: 16, height: 16, channels: 4 } }).png().toBuffer()
  for (const id of ['alpha', 'beta']) {
    const target = path.join(sources, id)
    await mkdir(target, { recursive: true }); await writeFile(path.join(target, 'character.json'), JSON.stringify(source(id)))
    await writeFile(path.join(target, 'body.png'), image)
  }
  const registry = await buildCharacters({ sourceRoot: sources, outputRoot: output, ids: ['beta'], maxSize: 64 })
  assert.deepEqual(registry.characters.map(c => c.id), ['beta'])
  assert.deepEqual((await readdir(output)).sort(), ['beta', 'registry.json'])
  const absent = path.join(dir, 'absent')
  await assert.rejects(buildCharacters({ sourceRoot: sources, outputRoot: absent, ids: ['unknown'] }), /Unknown/)
  await assert.rejects(readdir(absent), { code: 'ENOENT' })
  await assert.rejects(buildCharacters({ sourceRoot: sources, outputRoot: absent, ids: ['beta', 'beta'] }), /distinct/)
  await assert.rejects(buildCharacters({ sourceRoot: sources, outputRoot: absent, ids: ['beta'], requireAdmission: true }), /admission policy/)
})

test('asset catalogs export only declared files, check hashes and reject traversal or overwrite', async t => {
  const dir = await temporary(t), root = path.join(dir, 'assets'), output = path.join(dir, 'export')
  await mkdir(root); await writeFile(path.join(root, 'chosen.json'), '{}'); await writeFile(path.join(root, 'unrelated.png'), 'unused')
  const catalog = await createAssetCatalog(root, 'demo', ['chosen.json'], { appearance: 'chosen.json' })
  await exportAssetPack({ root, catalog, output })
  assert.deepEqual((await readdir(output)).sort(), ['asset-pack.json', 'chosen.json'])
  await assert.rejects(exportAssetPack({ root, catalog, output }), { code: 'EEXIST' })
  await writeFile(path.join(root, 'chosen.json'), 'changed')
  await assert.rejects(exportAssetPack({ root, catalog, output: path.join(dir, 'bad') }), /hash mismatch/)
  await assert.rejects(createAssetCatalog(root, 'demo', ['../escape']))
  await writeFile(path.join(dir, 'outside'), 'private')
  await symlink(path.join(dir, 'outside'), path.join(root, 'link'))
  await assert.rejects(createAssetCatalog(root, 'demo', ['link']), /escapes/)
  assert.equal(await readFile(path.join(output, 'chosen.json'), 'utf8'), '{}')
})

test('standalone demo moves and cancels without office capabilities', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { demoScenePack } = await server.ssrLoadModule('/example/isolated-scene/src/world.ts')
  const { createSceneRuntime } = await server.ssrLoadModule('/packages/runtime/src/index.ts')
  const runtime = createSceneRuntime(demoScenePack); t.after(() => runtime.dispose())
  const command = (id, target) => ({ protocolVersion: '2.0', sceneId: runtime.sceneId, commandId: id, type: 'activity.start',
    capability: 'scene.move', participants: [{ entityId: 'walker', role: 'actor' }], params: { targetId: target, anchor: 'approach' } })
  assert.equal(runtime.submit(command('move-a', 'point-a')).status, 'running')
  for (let i = 0; i < 400 && runtime.getRecord('move-a').status === 'running'; i++) runtime.tick(50)
  assert.equal(runtime.getRecord('move-a').status, 'completed')
  assert.deepEqual(runtime.readActors()[0].position, { x: 2, y: 3 })
  runtime.submit(command('move-b', 'point-b')); runtime.tick(50)
  runtime.submit({ protocolVersion: '2.0', sceneId: runtime.sceneId, commandId: 'cancel', type: 'command.cancel', targetCommandId: 'move-b' })
  assert.equal(runtime.getRecord('move-b').status, 'cancelled')
  assert(!runtime.snapshot().plugins.some(plugin => plugin.id.startsWith('office.')))
})

test('appearance resolver fetches selected manifests once and resolves relative resources', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { createAppearanceResolver, mountScene } = await server.ssrLoadModule('/packages/renderer-pixi/src/assembly.ts')
  const calls = []
  const manifest = { schemaVersion: 1, asset: { id: 'walker', revision: '1' }, adapterId: 'test',
    adapterApiVersion: 1, rendererApiVersion: 'pixi-1', presentationProfileId: 'demo',
    capabilities: { variants: [], combinations: [], contactProfiles: [], sockets: [] }, source: { format: 'test', uri: './frames.json' } }
  const previousFetch = globalThis.fetch; t.after(() => { globalThis.fetch = previousFetch })
  globalThis.fetch = async url => { calls.push(url); return { ok: true, url, json: async () => manifest } }
  const resolve = createAppearanceResolver(id => `https://example.test/${id}/visual.json`)
  const [a, b] = await Promise.all([resolve('walker'), resolve('walker')])
  assert.equal(a, b); assert.deepEqual(calls, ['https://example.test/walker/visual.json'])
  assert.equal(a.source.uri, 'https://example.test/walker/frames.json')
  const abort = new AbortController(); abort.abort()
  await assert.rejects(mountScene({}, async () => { assert.fail('Cancelled scene must not load') }, { signal: abort.signal }), { name: 'AbortError' })
})
