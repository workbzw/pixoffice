import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { inspectCharacterQuality, sha256, VISUAL_CHECKS } from '../../scripts/characters/quality.mjs'

export const writeJson = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n')

// Synthetic geometry is a test fixture, never a candidate for the real character library.
export async function qualityFixture(directory, id = 'candidate') {
  await mkdir(directory, { recursive: true })
  const source = { schemaVersion: 1, id, label: id, profile: 'office', canvas: { width: 256, height: 384 }, pivot: { x: 128, y: 344 }, referenceHeight: 280, displayHeight: 84, portrait: 'idle.front', clips: {} }
  const standard = { schemaVersion: 1, canvas: source.canvas, pivot: source.pivot, referenceHeight: 280, displayHeight: 84,
    tolerance: { headWidth: 14, headHeight: 16, headCenter: 2, foot: 2, headAreaRatio: .035 },
    views: Object.fromEntries(['front', 'right', 'back'].map(view => [view, { headWidth: 80, headHeight: 80, headArea: 6400 }])), requiredClips: [], frames: {} }
  const quality = { schemaVersion: 1, references: {}, referenceHashes: {}, registrations: {}, actions: {} }
  const buffers = new Map()
  function pixels(footY, phase = 0) {
    const data = Buffer.alloc(256 * 384 * 4)
    const rect = (x, y, width, height, color) => {
      for (let row = y; row < y + height; row++) for (let col = x; col < x + width; col++) data.set([...color, 255], (row * 256 + col) * 4)
    }
    rect(88, 64, 80, 80, [80, 40, 20]); rect(108, 164, 40, 110, [30, 100, 140])
    rect(108, 274, 12, footY - 274, [40, 50, 60]); rect(136, 274, 12, footY - 274, [40, 50, 60])
    rect(60, 170, 10, 5, [200, 150, 110]); rect(186, 170, 10, 5, [200, 150, 110])
    if (phase) rect(112 + phase * 3, 267, 2, 2, [100 + phase * 20, 20, 50])
    return data
  }
  async function frame(file, view, footY, phase = 0, press) {
    const data = pixels(footY, phase)
    if (press) data.set([150, 100, 50, 255], (172 * 256 + (press === 'left' ? 64 : 190)) * 4)
    const bytes = await sharp(data, { raw: { width: 256, height: 384, channels: 4 } }).png().toBuffer()
    await mkdir(path.dirname(path.join(directory, file)), { recursive: true }); await writeFile(path.join(directory, file), bytes)
    buffers.set(file, bytes)
    standard.frames[file] = { view, headTop: 60, headBottom: 156, footY }
    quality.registrations[file] = { scale: 1, x: 0, y: 0 }
    return file
  }
  const contract = (name, files, template, loop = false) => {
    source.clips[name] = { loop, frames: files.map(file => ({ file, durationMs: 250 })) }
    standard.requiredClips.push(name)
    quality.actions[name] = { template, reference: files[0], changes: [] }
    if (template === 'walk') quality.actions[name].phases = ['left-contact', 'left-pass', 'right-contact', 'right-pass']
    if (['walk', 'transition', 'gesture'].includes(template)) quality.actions[name].continuity = { maxHeadStepPx: 4, maxHeadAreaStepRatio: .035, maxSilhouetteChangeRatio: .35 }
  }
  for (const view of ['front', 'right', 'back']) {
    const idle = await frame(`idle/${view}.png`, view, 344)
    contract(`idle.${view}`, [idle], 'still')
    quality.references[view] = idle; quality.referenceHashes[view] = sha256(buffers.get(idle))
    const walk = []
    for (let i = 0; i < 4; i++) walk.push(await frame(`walk/${view}-${i}.png`, view, 344, i))
    contract(`walk.${view}`, walk, 'walk', true)
  }
  for (const action of ['idle', 'walk']) source.clips[`${action}.left`] = { alias: `${action}.right`, mirrorX: true }
  const seated = await frame('sit/back.png', 'back', 377), turn = await frame('sit/right.png', 'right', 377)
  contract('sit.back', [seated], 'still'); contract('talk.seated-right', [turn], 'still')
  source.clips['talk.seated-left'] = { alias: 'talk.seated-right', mirrorX: true }
  contract('stand-up.back', [seated, 'idle/back.png'], 'transition')
  contract('sit-down.back', ['idle/back.png', seated], 'transition')
  const left = await frame('work/left.png', 'back', 377, 0, 'left'), right = await frame('work/right.png', 'back', 377, 0, 'right')
  contract('work.quiet-back', [seated, left, seated, right], 'work', true)
  quality.actions['work.quiet-back'].changes = [{ x: 58, y: 168, width: 16, height: 12 }, { x: 182, y: 168, width: 16, height: 12 }]
  const save = async () => { for (const [name, value] of Object.entries({ character: source, standard, quality })) await writeJson(path.join(directory, `${name}.json`), value) }
  await save()
  return { source, standard, quality, buffers, save, async review() {
    const report = await inspectCharacterQuality(directory)
    if (!report.passed) throw new Error(JSON.stringify(report.issues))
    const evidence = await readFile(path.join(directory, 'idle/front.png'))
    const review = { schemaVersion: 1, digest: report.digest, reviewer: 'automated-test-fixture-only', reviewedAt: '2026-09-30T00:00:00Z',
      checks: Object.fromEntries(VISUAL_CHECKS.map(name => [name, true])), evidence: [{ file: 'idle/front.png', sha256: sha256(evidence) }], notes: 'Synthetic test data, not actual visual approval.' }
    await writeJson(path.join(directory, 'review.json'), review)
    return review
  } }
}
