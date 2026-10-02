import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { buildCharacter, buildCharacters } from '../scripts/characters/build.mjs'
import { CharacterSourceSchema, CharacterManifestSchema, resolveCharacterClip, sampleCharacterClip, characterFrameDependencies } from '../src/scene/characters/packSchema.ts'
import { ResourceLeaseCache } from '../src/scene/assets/ResourceLeaseCache.ts'
import { characterPackFixture } from './helpers/characterPack.mjs'

async function temporary(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'office-character-pack-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}
async function fixture(directory, id = 'new-resident') {
  await mkdir(path.join(directory, 'walk'), { recursive: true })
  const clips = { 'idle.front': { frames: [{ file: 'walk/001.png', durationMs: 100 }], loop: false } }
  const steps = []
  for (let i = 1; i <= 4; i++) {
    const file = `walk/00${i}.png`
    const body = await sharp({ create: { width: 40, height: 72, channels: 4, background: { r: i * 40, g: 80, b: 100, alpha: 1 } } }).png().toBuffer()
    await sharp({ create: { width: 64, height: 96, channels: 4, background: '#00000000' } }).composite([{ input: body, left: 12, top: 12 }]).png().toFile(path.join(directory, file))
    steps.push({ file, durationMs: i * 50 })
  }
  clips['walk.front'] = { frames: steps, loop: true }
  for (const direction of ['back', 'left', 'right']) for (const action of ['idle', 'walk']) clips[`${action}.${direction}`] = { alias: `${action}.front`, mirrorX: direction === 'left' }
  const source = { schemaVersion: 1, id, label: 'New resident', profile: 'basic', canvas: { width: 64, height: 96 }, pivot: { x: 32, y: 84 }, referenceHeight: 72, displayHeight: 84, portrait: 'idle.front', clips }
  await writeFile(path.join(directory, 'character.json'), JSON.stringify(source))
  return source
}

test('character packs build deterministically, paginate and preserve source pixels and offsets', async t => {
  const directory = await temporary(t)
  await fixture(directory)
  const first = await buildCharacter(directory, { maxSize: 80 })
  const second = await buildCharacter(directory, { maxSize: 80 })
  assert(first.manifest.pages.length > 1)
  assert.deepEqual(first.manifest, second.manifest)
  for (const [file, buffer] of first.outputs) assert(buffer.equals(second.outputs.get(file)))
  for (const [file, frame] of Object.entries(first.manifest.frames)) {
    assert.deepEqual(frame.offset, { x: 12, y: 12 })
    const original = await sharp(path.join(directory, file)).extract({ left: 12, top: 12, width: 40, height: 72 }).raw().toBuffer()
    const packed = await sharp(first.outputs.get(first.manifest.pages[frame.page].image)).extract({ left: frame.rect.x, top: frame.rect.y, width: frame.rect.width, height: frame.rect.height }).raw().toBuffer()
    assert(original.equals(packed), file)
  }
})

test('lossless WebP atlases keep PNG frame coordinates, timing, dimensions and visible pixels', async t => {
  const directory = await temporary(t)
  await fixture(directory)
  const png = await buildCharacter(directory, { atlasFormat: 'png' })
  const webp = await buildCharacter(directory)
  assert.deepEqual(webp.manifest.frames, png.manifest.frames)
  assert.deepEqual(webp.manifest.clips, png.manifest.clips)
  assert.deepEqual(webp.manifest.canvas, png.manifest.canvas)
  for (const [index, page] of webp.manifest.pages.entries()) {
    assert.match(page.image, /\.webp$/)
    const before = await sharp(png.outputs.get(png.manifest.pages[index].image)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const after = await sharp(webp.outputs.get(page.image)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    assert.deepEqual(after.info, before.info)
    for (let offset = 0; offset < before.data.length; offset += 4) {
      assert.equal(after.data[offset + 3], before.data[offset + 3])
      if (before.data[offset + 3]) assert(before.data.subarray(offset, offset + 3).equals(after.data.subarray(offset, offset + 3)))
    }
  }
  const legacy = structuredClone(webp.manifest)
  legacy.pages.forEach(page => { page.image = page.image.replace('.webp', '.png') })
  assert(CharacterManifestSchema.safeParse(legacy).success, 'old PNG packs remain compatible')
})

test('adding a source directory registers a new character without editing renderer code', async t => {
  const root = await temporary(t), sourceRoot = path.join(root, 'source'), outputRoot = path.join(root, 'output')
  await fixture(path.join(sourceRoot, 'first'), 'first')
  const first = await buildCharacters({ sourceRoot, outputRoot, requireAdmission: false })
  assert.equal(first.characters.length, 1)
  await fixture(path.join(sourceRoot, 'second'), 'second')
  const second = await buildCharacters({ sourceRoot, outputRoot, requireAdmission: false })
  assert.deepEqual(second.characters.map(entry => entry.id), ['first', 'second'])
  await buildCharacters({ sourceRoot, outputRoot, check: true, requireAdmission: false })
  const before = await readFile(path.join(outputRoot, 'registry.json'))
  await writeFile(path.join(sourceRoot, 'second', 'character.json'), '{}')
  await assert.rejects(buildCharacters({ sourceRoot, outputRoot, requireAdmission: false }))
  assert(before.equals(await readFile(path.join(outputRoot, 'registry.json'))), 'failed builds leave the working registry intact')
})

test('office packs put only seated/work dependencies in startup atlases and publish small stable portraits', async () => {
  const built = await buildCharacter(new URL('../art/characters/packs/marvis/', import.meta.url).pathname)
  const expected = new Set(characterFrameDependencies(built.manifest, ['sit.back', 'work.quiet-back']))
  const startup = Object.entries(built.manifest.frames).filter(([, frame]) => built.manifest.pages[frame.page].group === 'startup').map(([key]) => key)
  assert.deepEqual(new Set(startup), expected)
  assert.equal(built.manifest.pages[built.manifest.frames[resolveCharacterClip(built.manifest, 'walk.back').frames[0].frame].page].group, 'deferred')
  const source = JSON.parse(await readFile(new URL('../art/characters/packs/marvis/character.json', import.meta.url)))
  assert.equal(Object.keys(built.manifest.frames).length, new Set(Object.values(source.clips).flatMap(clip => clip.frames?.map(frame => frame.file) ?? [])).size)
  assert.deepEqual(built.portrait.canvas, source.canvas)
  assert.equal(built.portrait.referenceHeight, source.referenceHeight)
  const image = built.outputs.get(built.portrait.image), metadata = await sharp(image).metadata()
  assert.equal(metadata.format, 'webp')
  assert(metadata.width < source.canvas.width && metadata.height < source.canvas.height)
  assert(image.length < 12000)
  assert(built.outputs.get(built.manifestFile), 'portrait generation does not replace the manifest')
})

test('action dependencies include aliased bodies, independent mouths and procedural work parts', () => {
  const direct = frame => ({ loop: false, frames: [{ frame, durationMs: 100 }] })
  const rig = { clips: {
    'idle.front': { loop: false, frames: [{ frame: 'body.png', durationMs: 100, mouth: { view: 'front' } }] },
    'idle.left': { alias: 'idle.front', mirrorX: true },
    'mouth.closed': direct('closed.png'), 'mouth.speaking': direct('open.png'),
    'work.computer-back': direct('work.png'), 'arm.upper': direct('upper.png'), 'arm.forearm': direct('forearm.png'), 'arm.hand': direct('hand.png'),
  }, mouth: { views: { front: { closed: 'mouth.closed', speaking: 'mouth.speaking' } } },
  work: { upper: { clip: 'arm.upper' }, forearm: { clip: 'arm.forearm' }, hand: { clip: 'arm.hand' } } }
  assert.deepEqual(new Set(characterFrameDependencies(rig, ['idle.left', 'idle.front'])), new Set(['body.png', 'closed.png', 'open.png']))
  assert.deepEqual(new Set(characterFrameDependencies(rig, ['work.quiet-back'])), new Set(['work.png', 'upper.png', 'forearm.png', 'hand.png']))
})

test('bad source sizes, empty frames, missing files, escaping symlinks and stale output are rejected', async t => {
  const root = await temporary(t), directory = path.join(root, 'source'), outputRoot = path.join(root, 'output')
  await fixture(directory)
  const original = await readFile(path.join(directory, 'walk/001.png'))
  await sharp({ create: { width: 32, height: 32, channels: 4, background: '#00000000' } }).png().toFile(path.join(directory, 'walk/001.png'))
  await assert.rejects(buildCharacter(directory), /expected canvas/)
  await sharp({ create: { width: 64, height: 96, channels: 4, background: '#00000000' } }).png().toFile(path.join(directory, 'walk/001.png'))
  await assert.rejects(buildCharacter(directory), /Empty transparent frame/)
  await rm(path.join(directory, 'walk/001.png'))
  await assert.rejects(buildCharacter(directory), /ENOENT/)
  await writeFile(path.join(root, 'outside.png'), original)
  await symlink(path.join(root, 'outside.png'), path.join(directory, 'walk/001.png'))
  await assert.rejects(buildCharacter(directory), /escapes character directory/)
  await rm(path.join(directory, 'walk/001.png'))
  await writeFile(path.join(directory, 'walk/001.png'), original)
  await assert.rejects(buildCharacters({ sourceRoot: root, outputRoot, check: true, requireAdmission: false }), /stale generated resource/)
})

test('manifest contracts reject missing office actions, alias cycles, broken frames and invalid timing', async t => {
  const directory = await temporary(t), source = await fixture(directory)
  const { manifest } = await buildCharacter(directory)
  assert(CharacterSourceSchema.safeParse(source).success)
  for (const mutate of [
    value => { value.profile = 'office' },
    value => { delete value.clips['walk.back'] },
    value => { value.clips['idle.front'] = { alias: 'idle.back' } },
    value => { value.clips['walk.front'].frames[0].durationMs = 0 },
    value => { value.clips['walk.front'].frames[0].file = '../outside.png' },
    value => { value.pivot.y = 200 },
  ]) { const invalid = structuredClone(source); mutate(invalid); assert(!CharacterSourceSchema.safeParse(invalid).success) }
  for (const mutate of [
    value => { value.frames['walk/001.png'].page = 99 },
    value => { value.frames['walk/001.png'].rect.width = 2048 },
    value => { value.frames['walk/001.png'].offset.x = 2048 },
    value => { delete value.frames['walk/001.png'] },
    value => { value.pages[0].image = 'https://example.com/a.png' },
  ]) { const invalid = structuredClone(manifest); mutate(invalid); assert(!CharacterManifestSchema.safeParse(invalid).success) }
})

test('clip sampling supports variable timing, loop boundaries, explicit mirrors and safe fallbacks', async t => {
  const directory = await temporary(t)
  await fixture(directory)
  const { manifest } = await buildCharacter(directory)
  assert.deepEqual([0, 49, 50, 149, 150, 299, 300, 499, 500].map(time => sampleCharacterClip(manifest, 'walk.front', time).index), [0, 0, 1, 1, 2, 2, 3, 3, 0])
  assert.equal(resolveCharacterClip(manifest, 'walk.left').mirrorX, true)
  assert.equal(resolveCharacterClip(manifest, 'walk.right').mirrorX, false)
  assert.equal(resolveCharacterClip(manifest, 'run.front').fallback, true)
  assert.equal(resolveCharacterClip(manifest, 'sit.back'), undefined, 'standing cannot impersonate a missing seated action')
  assert.equal(sampleCharacterClip(manifest, 'idle.front', 99999).completed, true)
  assert.equal(sampleCharacterClip(manifest, 'walk.front', 0, 1).index, 3, 'transition progress 1 holds its final pose, never wraps')
  for (const value of [NaN, Infinity, -1]) assert.equal(sampleCharacterClip(manifest, 'walk.front', value).index, 0)
})

test('all six migrated packs validate, have office actions, separate run/walk and use one fixed scale', async () => {
  const registry = JSON.parse(await readFile(new URL('../public/characters/registry.json', import.meta.url), 'utf8'))
  assert.equal(registry.characters.length, 6)
  for (const entry of registry.characters) {
    const pack = await characterPackFixture(entry.id)
    CharacterManifestSchema.parse(pack.manifest)
    const walk = resolveCharacterClip(pack.manifest, 'walk.back'), run = resolveCharacterClip(pack.manifest, 'run.back')
    assert.equal(walk.frames.length, 4); assert.equal(run.frames.length, 4)
    assert(walk.frames.every(frame => !run.frames.some(other => frame.frame === other.frame)))
    for (const name of Object.keys(pack.manifest.clips)) assert(sampleCharacterClip(pack.manifest, name))
    const pivot = pack.manifest.pivot
    for (const texture of pack.textures.values()) {
      assert.equal(texture.orig.width, pack.manifest.canvas.width)
      assert.equal(texture.orig.height, pack.manifest.canvas.height)
      assert(pivot.y <= texture.orig.height)
    }
    pack.dispose()
  }
})

test('resource leases deduplicate loads and closing preview cannot unload scene textures', async () => {
  let loads = 0, disposed = 0
  const cache = new ResourceLeaseCache(async () => { loads++; return { dispose() { disposed++ } } }, 60000)
  const [scene, preview] = await Promise.all([cache.acquire('person'), cache.acquire('person')])
  assert.equal(loads, 1); assert.equal(scene.value, preview.value)
  preview.release(); preview.release(); cache.clearUnused()
  assert.equal(disposed, 0); assert.equal(cache.get('person'), scene.value)
  scene.release(); cache.clearUnused(); await Promise.resolve(); await Promise.resolve()
  assert.equal(disposed, 1); assert.equal(cache.get('person'), undefined)
})

test('resource failures can retry and reacquisition waits for an in-progress unload', async () => {
  let attempts = 0, finishUnload, unloading = false
  const cache = new ResourceLeaseCache(async () => {
    assert.equal(unloading, false)
    if (++attempts === 1) throw new Error('network failed')
    return { dispose: () => new Promise(resolve => { unloading = true; finishUnload = () => { unloading = false; resolve() } }) }
  }, 60000)
  await assert.rejects(cache.acquire('person'), /network failed/)
  const lease = await cache.acquire('person')
  lease.release(); cache.clearUnused(); await Promise.resolve()
  const pending = cache.acquire('person')
  await Promise.resolve(); assert.equal(attempts, 2)
  finishUnload()
  const next = await pending
  assert.equal(attempts, 3)
  next.release(); cache.clearUnused(); await Promise.resolve(); finishUnload()
})
