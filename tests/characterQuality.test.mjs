import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { inspectCharacterQuality, assertCharacterAdmission, readQualityInputs, compareFrames, validateVisualReview } from '../scripts/characters/quality.mjs'
import { buildCharacter, buildCharacters } from '../scripts/characters/build.mjs'
import { publishCharacterCandidate } from '../scripts/characters/publish.mjs'
import { prepareCharacterPreview } from '../scripts/characters/preview.mjs'
import { createQualityDraft, main } from '../scripts/characters/quality-cli.mjs'
import { qualityFixture, writeJson } from './helpers/characterQuality.mjs'

async function temporary(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'office-admission-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}
const hasIssue = (report, code) => report.issues.some(issue => issue.code === code)

test('a complete candidate requires both automatic checks and version-bound visual acceptance', async t => {
  const root = await temporary(t), fixture = await qualityFixture(root)
  const report = await inspectCharacterQuality(root)
  assert(report.passed, JSON.stringify(report.issues))
  assert(report.actions.some(action => action.name === 'work.quiet-back' && action.outsideChanges === 0))
  await assert.rejects(assertCharacterAdmission(root), /review.json/)
  await fixture.review()
  assert.equal((await assertCharacterAdmission(root)).status, 'approved')
  await buildCharacter(root, { requireAdmission: true })
  fixture.source.label = 'Edited'; await fixture.save()
  await assert.rejects(assertCharacterAdmission(root), /stale/)
})

test('missing rules, missing coverage and weakened standards cannot enter the formal library', async t => {
  const root = await temporary(t), fixture = await qualityFixture(root)
  await rm(path.join(root, 'quality.json'))
  assert(hasIssue(await inspectCharacterQuality(root), 'quality.missing'))
  await rm(path.join(root, 'standard.json'))
  assert(hasIssue(await inspectCharacterQuality(root), 'standard.missing'))
  await fixture.save()
  delete fixture.quality.actions['work.quiet-back']; await fixture.save()
  assert(hasIssue(await inspectCharacterQuality(root), 'action.uncovered'))
  fixture.standard.requiredClips = fixture.standard.requiredClips.filter(name => name !== 'walk.back')
  fixture.standard.tolerance.headAreaRatio = .1; await fixture.save()
  const report = await inspectCharacterQuality(root)
  assert(hasIssue(report, 'standard.uncovered')); assert(hasIssue(report, 'standard.tolerance'))
})

test('work contracts reject redraws, per-frame scaling and body shifts without weakening head tolerances', async t => {
  const root = await temporary(t), fixture = await qualityFixture(root)
  const file = path.join(root, 'work/left.png')
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  data.set([255, 0, 0, 255], (200 * 256 + 128) * 4)
  await sharp(data, { raw: info }).png().toFile(file)
  let report = await inspectCharacterQuality(root)
  assert(hasIssue(report, 'pixels.static')); assert(!hasIssue(report, 'standard.failed'), 'ordinary proportion checks alone miss torso redraws')
  fixture.quality.registrations['work/left.png'].scale = 1.002
  fixture.quality.registrations['work/right.png'].y = 1; await fixture.save()
  report = await inspectCharacterQuality(root)
  assert(hasIssue(report, 'registration.scale')); assert(hasIssue(report, 'registration.position'))
})

test('missing import records, overbroad masks and fake motion are rejected', async t => {
  const root = await temporary(t), fixture = await qualityFixture(root)
  delete fixture.quality.registrations['work/left.png']; await fixture.save()
  assert(hasIssue(await inspectCharacterQuality(root), 'registration.missing'))
  fixture.quality.actions['work.quiet-back'].changes = [{ x: 0, y: 0, width: 256, height: 384 }]; await fixture.save()
  assert(hasIssue(await inspectCharacterQuality(root), 'mask.bounds'))
  fixture.quality.actions['work.quiet-back'].changes = [{ x: 58, y: 168, width: 16, height: 12 }, { x: 182, y: 168, width: 16, height: 12 }]
  const neutral = await readFile(path.join(root, 'sit/back.png'))
  await writeFile(path.join(root, 'work/left.png'), neutral); await writeFile(path.join(root, 'work/right.png'), neutral)
  await fixture.save()
  assert(hasIssue(await inspectCharacterQuality(root), 'work.motion'))
})

test('loop continuity includes the last-to-first edge and uses actual pixels, not just authored head bands', async t => {
  const root = await temporary(t), fixture = await qualityFixture(root)
  for (let phase = 0; phase < 4; phase++) {
    const file = path.join(root, `walk/back-${phase}.png`)
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const original = Buffer.from(data)
    for (let y = 64; y < 156; y++) for (let x = 88; x < 168; x++) data.fill(0, (y * 256 + x) * 4, (y * 256 + x) * 4 + 4)
    for (let y = 64; y < 144; y++) for (let x = 88; x < 168; x++) original.copy(data, ((y + phase * 2) * 256 + x) * 4, (y * 256 + x) * 4, (y * 256 + x) * 4 + 4)
    await sharp(data, { raw: info }).png().toFile(file)
  }
  const report = await inspectCharacterQuality(root)
  assert(hasIssue(report, 'continuity.jump'))
  assert.equal(report.actions.find(action => action.name === 'walk.back').maxHeadStepPx, 6)
  fixture.source.clips['walk.back'].loop = false; await fixture.save()
  assert.equal((await inspectCharacterQuality(root)).actions.find(action => action.name === 'walk.back').maxHeadStepPx, 2)
})

test('identity changes, disguised aliases and part rules cannot exempt body artwork', async t => {
  const root = await temporary(t), fixture = await qualityFixture(root)
  fixture.quality.referenceHashes.front = '0'.repeat(64)
  fixture.quality.actions['sit.back'].template = 'part'; await fixture.save()
  const report = await inspectCharacterQuality(root)
  assert(hasIssue(report, 'reference.changed')); assert(hasIssue(report, 'action.template'))
  fixture.source.clips['work.quiet-back'] = { alias: 'sit.back' }; await fixture.save()
  assert(hasIssue(await inspectCharacterQuality(root), 'action.template'))
})

test('an existing pack cannot reuse its admission after its configuration changes', async () => {
  const directory = path.resolve('art/characters/packs/code-agent')
  const admission = await assertCharacterAdmission(directory)
  assert(['legacy-frozen', 'approved'].includes(admission.status))
  const input = await readQualityInputs(directory)
  input.source.label += '-modified'
  await assert.rejects(assertCharacterAdmission(directory, input), /admission rejected|stale/)
  if (admission.status === 'legacy-frozen') assert(hasIssue(await inspectCharacterQuality(directory), 'quality.missing'))
})

test('review records cannot pass with unchecked steps, stale evidence or escaping evidence paths', async t => {
  const root = await temporary(t), fixture = await qualityFixture(root), review = await fixture.review()
  review.checks.motion = false; await writeJson(path.join(root, 'review.json'), review)
  await assert.rejects(validateVisualReview(root, review.digest))
  review.checks.motion = true; review.evidence[0].sha256 = '0'.repeat(64); await writeJson(path.join(root, 'review.json'), review)
  await assert.rejects(validateVisualReview(root, review.digest), /evidence changed/)
  await symlink(path.join(root, 'idle/front.png'), path.join(root, 'evidence.png'))
  review.evidence[0].file = '../evidence.png'; await writeJson(path.join(root, 'review.json'), review)
  await assert.rejects(validateVisualReview(root, review.digest))
})

test('the normal builder enforces admission and leaves the old registry untouched on rejection', async t => {
  const root = await temporary(t), sourceRoot = path.join(root, 'packs'), outputRoot = path.join(root, 'out')
  const first = await qualityFixture(path.join(sourceRoot, 'first'), 'first'); await first.review()
  await buildCharacters({ sourceRoot, outputRoot })
  const previous = await readFile(path.join(outputRoot, 'registry.json'))
  await qualityFixture(path.join(sourceRoot, 'second'), 'second')
  await assert.rejects(buildCharacters({ sourceRoot, outputRoot }), /review.json/)
  assert(previous.equals(await readFile(path.join(outputRoot, 'registry.json'))))
})

test('publication preserves the previous version, rejects bad candidates and rolls back on build failure', async t => {
  const root = await temporary(t), sourceRoot = path.join(root, 'packs'), outputRoot = path.join(root, 'out'), backupRoot = path.join(root, 'backups')
  const staged = path.join(root, 'staged'), fixture = await qualityFixture(staged)
  await assert.rejects(publishCharacterCandidate(staged, { sourceRoot, outputRoot, backupRoot }), /review.json/)
  assert.deepEqual(await readdir(sourceRoot), [])
  await fixture.review()
  await publishCharacterCandidate(staged, { sourceRoot, outputRoot, backupRoot })
  const original = await readFile(path.join(sourceRoot, 'candidate/character.json'))
  fixture.source.label = 'Second revision'; await fixture.save(); await fixture.review()
  const second = await publishCharacterCandidate(staged, { sourceRoot, outputRoot, backupRoot })
  assert((await readFile(path.join(second.backup, 'character.json'))).equals(original))
  const active = await readFile(path.join(sourceRoot, 'candidate/character.json')), registry = await readFile(path.join(outputRoot, 'registry.json'))
  await mkdir(path.join(sourceRoot, 'broken')); await writeFile(path.join(sourceRoot, 'broken/character.json'), '{}')
  fixture.source.label = 'Rejected third revision'; await fixture.save(); await fixture.review()
  await assert.rejects(publishCharacterCandidate(staged, { sourceRoot, outputRoot, backupRoot }))
  assert((await readFile(path.join(sourceRoot, 'candidate/character.json'))).equals(active))
  assert((await readFile(path.join(outputRoot, 'registry.json'))).equals(registry))
  assert(!(await readdir(sourceRoot)).some(name => name.startsWith('.')))
})

test('drafting does not overwrite rules or fabricate registration and visual approval', async t => {
  const root = await temporary(t), fixture = await qualityFixture(root)
  await assert.rejects(createQualityDraft(root), /EEXIST/)
  await rm(path.join(root, 'quality.json'))
  const draft = await createQualityDraft(root)
  assert.deepEqual(draft.registrations, {})
  assert.equal(draft.actions['talk.seated-right'].template, 'still')
  assert(!('review' in draft)); assert(!('evidence' in draft))
  await fixture.save()
  t.mock.method(console, 'log', () => {})
  assert.equal(await main(['review-template', '--pack', root]), 0)
  const pending = JSON.parse(await readFile(path.join(root, 'review.pending.json')))
  assert(Object.values(pending.checks).every(value => value === false))
  await assert.rejects(assertCharacterAdmission(root), /review.json/)
})

test('transparent RGB noise is ignored, while even a visible one-pixel body change is rejected', () => {
  const a = Buffer.alloc(16), b = Buffer.from(a)
  b[0] = 200
  assert.equal(compareFrames(a, b, 2).outsideChanges, 0)
  b[3] = 1
  assert.equal(compareFrames(a, b, 2).outsideChanges, 1)
})

test('candidates can be previewed without approval, without writing a production registry or approving them', async t => {
  const root = await temporary(t), staged = path.join(root, 'staged'), outputRoot = path.join(root, 'previews')
  await qualityFixture(staged)
  const productionRegistry = await readFile('public/characters/registry.json')
  const preview = await prepareCharacterPreview(staged, { outputRoot })
  assert.equal(preview.status, 'preview-only')
  assert.match(preview.previewPath, /^\/character-lab\.html\?candidate=[a-f0-9]{64}$/)
  const registry = JSON.parse(await readFile(path.join(outputRoot, preview.digest, 'registry.json')))
  assert.equal(registry.characters[0].id, 'candidate')
  assert(productionRegistry.equals(await readFile('public/characters/registry.json')))
  await assert.rejects(assertCharacterAdmission(staged), /review.json/)
})

test('archived v4 work frames reproduce body drift, while Wang Ming v2 keeps its body fixed', async () => {
  // Versioned regression artwork, deliberately not the current clip selected by character.json.
  const regions = [{ x: 25, y: 215, width: 55, height: 55 }, { x: 174, y: 215, width: 55, height: 55 }]
  for (const id of ['marvis', 'code-agent', 'app-agent', 'data-agent']) {
    const version = id === 'marvis' ? 'v2' : 'v4', directory = path.resolve('art/characters/packs', id, `work/quiet-back-${version}`)
    const frames = []
    for (const file of ['001.png', '002.png', '004.png']) frames.push(await sharp(await readFile(path.join(directory, file))).ensureAlpha().raw().toBuffer())
    for (const raw of frames.slice(1)) {
      const diff = compareFrames(frames[0], raw, 256, regions)
      if (id === 'marvis') assert.equal(diff.outsideChanges, 0)
      else assert(diff.outsideChanges > 100, `${id}: the new gate detects the known redraw defect`)
    }
  }
})
