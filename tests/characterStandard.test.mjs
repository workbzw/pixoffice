import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import sharp from 'sharp'
import { validateCharacterStandard } from '../scripts/characters/standard.mjs'
import { buildCharacter } from '../scripts/characters/build.mjs'

const directory = fileURLToPath(new URL('../art/characters/packs/marvis/', import.meta.url))
async function fixture(id = 'marvis') {
  const directory = fileURLToPath(new URL(`../art/characters/packs/${id}/`, import.meta.url))
  const source = JSON.parse(await readFile(path.join(directory, 'character.json'), 'utf8'))
  const standard = JSON.parse(await readFile(path.join(directory, 'standard.json'), 'utf8'))
  const buffers = new Map()
  for (const file of Object.keys(standard.frames)) buffers.set(file, await readFile(path.join(directory, file)))
  return { directory, source, standard, buffers }
}

for (const id of ['marvis', 'code-agent', 'file-agent', 'app-agent', 'review-agent', 'data-agent']) {
test(`${id}: locomotion, seat and typing clips share calibrated head areas and foot anchors`, async () => {
  const { directory, source, standard, buffers } = await fixture(id)
  const measured = await validateCharacterStandard(directory, source, buffers)
  assert.equal(measured.length, id === 'marvis' ? 26 : 27)
  if (id !== 'marvis') {
    for (const frame of source.clips['work.quiet-back'].frames) {
      assert(measured.some(result => result.file === frame.file), 'complete generated work frames are actually validated')
    }
  }
  for (const frame of measured) {
    const target = standard.views[frame.view]
    const rule = standard.frames[frame.file]
    assert(Math.abs(frame.headWidth - target.headWidth) <= (rule.headWidthTolerance ?? standard.tolerance.headWidth))
    assert(Math.abs(frame.headArea / target.headArea - 1) <= .035)
    assert(Math.abs(frame.headHeight - target.headHeight) <= 16)
    assert(Math.abs(frame.headCenter - 128) <= 2)
  }
  for (const view of ['front', 'back']) {
    const frames = source.clips[`walk.${view}`].frames
    assert(frames.every(frame => frame.file.startsWith(`standard-v2/walk/${view}/`)))
    assert.deepEqual(frames.map(frame => frame.durationMs), [200, 200, 200, 200])
    assert.equal(new Set(frames.map(frame => createHash('sha256').update(buffers.get(frame.file)).digest('hex'))).size, 4,
      'all four phases are independently authored, with no idle-pose substitution')
  }
  const typing = source.clips['work.typing-back']
  assert.equal(typing.loop, true)
  assert.deepEqual(typing.frames.map(frame => frame.durationMs), [210, 110, 210, 110])
  assert.equal(new Set(typing.frames.map(frame => createHash('sha256').update(buffers.get(frame.file)).digest('hex'))).size, 4)
  for (const frame of typing.frames) {
    assert(frame.file.startsWith('work/typing-back-v2/'))
    assert.equal(standard.frames[frame.file].footY, 377)
  }
  const registration = JSON.parse(await readFile(new URL('../art/characters/office-typing-v2/registered-frames.json', import.meta.url), 'utf8'))
  assert.equal(new Set(registration.find(entry => entry.id === id).frames.map(frame => frame.scale)).size, 1,
    'raising a forearm must not change the scale of the head and torso')
  const built = await buildCharacter(directory)
  assert(!('standard' in built.manifest), 'authoring checks do not add runtime state')
  assert.deepEqual(built.manifest.clips['stand-up.back'].frames.map(frame => frame.frame), [
    'standard-v2/sit/back/001.png', 'standard-v2/pose/lean/001.png', 'standard-v2/pose/rise/001.png', 'idle/back/001.png',
  ])
})
}

test('a new uncalibrated frame cannot silently replace a standard clip', async () => {
  const { source, buffers } = await fixture()
  source.clips['walk.back'].frames[0].file = 'walk/back/001.png'
  await assert.rejects(validateCharacterStandard(directory, source, buffers), /uncalibrated frame/)
})

test('head shrink and ground drift are rejected from actual PNG pixels', async () => {
  const { source, buffers } = await fixture()
  const key = 'standard-v2/walk/back/001.png', original = buffers.get(key)
  const smaller = await sharp(original).resize(230, 346).png().toBuffer()
  buffers.set(key, await sharp({ create: { width: 256, height: 384, channels: 4, background: '#00000000' } })
    .composite([{ input: smaller, left: 13, top: 34 }]).png().toBuffer())
  await assert.rejects(validateCharacterStandard(directory, source, buffers), /standard headWidth|standard headArea/)
  const moved = await sharp(original).extract({ left: 0, top: 0, width: 256, height: 379 }).png().toBuffer()
  buffers.set(key, await sharp({ create: { width: 256, height: 384, channels: 4, background: '#00000000' } })
    .composite([{ input: moved, left: 0, top: 5 }]).png().toBuffer())
  await assert.rejects(validateCharacterStandard(directory, source, buffers), /standard footY/)
})

test('the shared canvas, pivot and render scale cannot drift per character', async () => {
  for (const mutate of [s => { s.canvas.width++ }, s => { s.pivot.x++ }, s => { s.referenceHeight++ }, s => { s.displayHeight++ }]) {
    const { source, buffers } = await fixture()
    mutate(source)
    await assert.rejects(validateCharacterStandard(directory, source, buffers), /standard .*changed/)
  }
})

test('characters without an adopted art standard keep the original pipeline', async t => {
  const other = await mkdtemp(path.join(os.tmpdir(), 'office-unregistered-'))
  t.after(() => rm(other, { recursive: true, force: true }))
  const { source } = await fixture()
  assert.deepEqual(await validateCharacterStandard(other, source, new Map()), [])
})

test('registration can validate unpublished pixels and metadata before changing active files', async t => {
  const other = await mkdtemp(path.join(os.tmpdir(), 'office-preflight-'))
  t.after(() => rm(other, { recursive: true, force: true }))
  const { source, standard, buffers } = await fixture()
  assert.equal((await validateCharacterStandard(other, source, buffers, standard)).length, 26)
  standard.views.back.headArea = Math.round(standard.views.back.headArea * 1.1)
  await assert.rejects(validateCharacterStandard(other, source, buffers, standard), /standard headArea/)
  await assert.rejects(readFile(path.join(other, 'standard.json')), { code: 'ENOENT' })
})
