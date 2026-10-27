import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { after, before, test } from 'node:test'
import sharp from 'sharp'
import { measureFrame } from '../scripts/characters/standard.mjs'
import { inspectCharacterQuality } from '../scripts/characters/quality.mjs'

const root = path.resolve(import.meta.dirname, '..')
const ids = ['office-lead', 'code-agent', 'file-agent', 'app-agent', 'review-agent', 'data-agent']
let staging
const json = async file => JSON.parse(await readFile(file, 'utf8'))

function hands(data, headBottom) {
  const result = { left: { pixels: 0, x: 0 }, right: { pixels: 0, x: 0 } }
  // Palette-specific guard below the authored head band; not an anatomy detector.
  for (let y = Math.max(220, headBottom + 6); y < 295; y++) for (let x = 0; x < 256; x++) {
    const offset = (y * 256 + x) * 4
    const [r, g, b, alpha] = data.subarray(offset, offset + 4)
    if (alpha <= 128 || r <= 150 || r - g <= 15 || r - b <= 35 || g <= 75) continue
    const hand = x < 128 ? result.left : result.right
    hand.pixels++
    hand.x += x
  }
  for (const hand of Object.values(result)) hand.x /= Math.max(1, hand.pixels)
  return result
}

before(async () => {
  staging = await mkdtemp(path.join(tmpdir(), 'pixoffice-police-registration-'))
  await promisify(execFile)(process.execPath, ['art/characters/police-uniform-v1/import.mjs'], {
    cwd: root, env: { ...process.env, POLICE_STAGING_ROOT: staging },
  })
})
after(async () => { if (staging) await rm(staging, { recursive: true, force: true }) })

test('reimport refuses an existing candidate before overwriting its artwork records', async () => {
  const files = ['character.json', 'standard.json', 'quality.json']
  const saved = await Promise.all(files.map(file => readFile(path.join(staging, 'office-lead', file))))
  await assert.rejects(promisify(execFile)(process.execPath, ['art/characters/police-uniform-v1/import.mjs', 'office-lead'], {
    cwd: root, env: { ...process.env, POLICE_STAGING_ROOT: staging },
  }), /EEXIST/)
  for (const [index, file] of files.entries()) assert.deepEqual(await readFile(path.join(staging, 'office-lead', file)), saved[index])
})

for (const id of ids) test(`${id}: police seated and rising frames retain their standing head scale`, async () => {
  const directory = path.join(staging, id)
  const character = await json(path.join(directory, 'character.json'))
  const standard = await json(path.join(directory, 'standard.json'))
  const quality = await json(path.join(directory, 'quality.json'))
  const provenance = await json(path.join(directory, 'registration-source.json'))
  const measure = async file => {
    const { data, info } = await sharp(path.join(directory, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    assert.equal(info.width, 256)
    assert.equal(info.height, 384)
    return measureFrame(data, info.width, info.height, standard.frames[file])
  }
  assert.equal(character.referenceHeight, 280)
  assert.equal(character.displayHeight, 84)
  assert.deepEqual(character.pivot, { x: 128, y: 344 })
  const standing = await measure(character.clips['idle.back'].frames[0].file)
  const front = await measure(character.clips['idle.front'].frames[0].file)
  assert(Math.abs(standing.headTop - front.headTop) <= 18, 'back standing must not become a shorter body')
  const transition = character.clips['stand-up.back'].frames
  assert.equal(transition.length, 6)
  const scale = quality.registrations[transition[1].file].scale
  for (const [index, frame] of transition.entries()) {
    const measured = await measure(frame.file)
    if (index > 0) assert.equal(quality.registrations[frame.file].scale, scale, 'one scale for the v10 rise sheet')
    assert(Math.abs(measured.headArea / standing.headArea - 1) <= .035, `${frame.file}: head area drift`)
    assert(Math.abs(measured.headWidth - standing.headWidth) <= 14)
    assert(Math.abs(measured.headHeight - standing.headHeight) <= 16)
    assert(Math.abs(measured.headCenter - 128) <= 2)
    assert(Math.abs(measured.footY - Math.round(377 - index * 33 / 5)) <= 2)
    if (index > 0) assert.equal(provenance.find(record => record.file === frame.file).source, `sources/${id}-transition-v10.png`)
  }
  assert.deepEqual(character.clips['sit-down.back'].frames, [...transition].reverse())
  for (const frame of character.clips['work.quiet-back'].frames) {
    const measured = await measure(frame.file)
    assert(Math.abs(measured.headArea / standing.headArea - 1) <= .035, 'working must retain the standing head scale')
  }
})

for (const id of ids) test(`${id}: police lateral walking keeps standing proportions, passing poses and mouth registration`, async () => {
  const directory = path.join(staging, id)
  const character = await json(path.join(directory, 'character.json'))
  const standard = await json(path.join(directory, 'standard.json'))
  const quality = await json(path.join(directory, 'quality.json'))
  const provenance = await json(path.join(directory, 'registration-source.json'))
  const readFrame = async file => {
    const { data, info } = await sharp(path.join(directory, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    return { data, measured: measureFrame(data, info.width, info.height, standard.frames[file]) }
  }
  const idle = character.clips['idle.right'].frames[0]
  const standing = await readFrame(idle.file)
  const walk = character.clips['walk.right']
  assert(walk.loop)
  assert.equal(walk.frames.length, 4)
  assert.deepEqual(character.clips['walk.left'], { alias: 'walk.right', mirrorX: true })
  const hashes = [], measures = [], footSpans = [], foregroundLegs = []
  const scale = quality.registrations[walk.frames[0].file].scale
  for (const frame of walk.frames) {
    const { data, measured } = await readFrame(frame.file)
    hashes.push(createHash('sha256').update(data).digest('hex'))
    measures.push(measured)
    assert.equal(quality.registrations[frame.file].scale, scale)
    assert.equal(provenance.find(record => record.file === frame.file).source, `sources/${id}-sidewalk-v8.png`)
    assert(Math.abs(measured.headArea / standing.measured.headArea - 1) <= .035)
    assert(Math.abs(measured.headWidth - standing.measured.headWidth) <= 14)
    assert(Math.abs(measured.headHeight - standing.measured.headHeight) <= 16)
    assert(Math.abs(measured.headTop - standing.measured.headTop) <= 12, 'walking must not enlarge the full body')
    assert(Math.abs(measured.headCenter - 128) <= 2)
    assert.equal(standard.frames[frame.file].footY, 344)
    assert(Math.abs(measured.footY - 344) <= 2)
    assert.equal(frame.mouth.view, 'right')
    assert.equal(frame.mouth.scale, idle.mouth.scale)
    assert(Math.abs((frame.mouth.x - measured.headCenter) - (idle.mouth.x - standing.measured.headCenter)) < 1e-9)
    assert(Math.abs((frame.mouth.y - measured.headTop) - (idle.mouth.y - standing.measured.headTop)) < 1e-9)
    let left = 256, right = -1
    for (let y = 300; y < 347; y++) for (let x = 0; x < 256; x++) if (data[(y * 256 + x) * 4 + 3] >= 128) {
      left = Math.min(left, x); right = Math.max(right, x)
    }
    footSpans.push(right - left + 1)
    // The reviewed side artwork gives the near trouser leg a lighter navy tone.
    // Track that same leg across the two contact poses, not just different hashes.
    let foregroundX = 0, foregroundPixels = 0
    const revisedLegPalette = ['file-agent', 'app-agent'].includes(id)
    const legTop = revisedLegPalette ? 245 : 265
    const nearLegRed = revisedLegPalette ? 28 : 35
    for (let y = legTop; y < 315; y++) for (let x = 0; x < 256; x++) {
      const offset = (y * 256 + x) * 4
      const [r, g, b, alpha] = data.subarray(offset, offset + 4)
      if (alpha >= 128 && r >= nearLegRed && g >= 50 && b >= 75 && b < 140 && b - r > 20) {
        foregroundX += x
        foregroundPixels++
      }
    }
    foregroundLegs.push({ x: foregroundX / Math.max(1, foregroundPixels), pixels: foregroundPixels })
  }
  assert.equal(new Set(hashes).size, 4)
  assert(!hashes.includes(createHash('sha256').update(standing.data).digest('hex')), 'passing frames are not idle substitutes')
  for (const [index, measured] of measures.entries()) {
    const next = measures[(index + 1) % 4]
    assert(Math.abs(measured.headTop - next.headTop) <= 4)
    assert(Math.abs(measured.headArea / next.headArea - 1) <= .035)
  }
  assert(footSpans[1] < footSpans[0] * .85 && footSpans[3] < footSpans[2] * .85, 'passing poses must close the stride')
  assert(foregroundLegs[0].pixels > 200 && foregroundLegs[2].pixels > 200, 'both contact poses need the authored near-leg shading')
  // Compact indoor steps retain leg reversal without requiring the old marching amplitude.
  assert(foregroundLegs[0].x - foregroundLegs[2].x > standing.measured.headWidth * .12, 'the SAME foreground leg must travel from forward to backward')
  for (const index of [0, 2]) {
    assert(footSpans[index] <= measures[index].headWidth, 'indoor contact poses must not spread the feet wider than the head')
    const file = walk.frames[index].file
    const { data } = await readFrame(file)
    const swing = hands(data, standard.frames[file].headBottom)
    assert(swing.left.pixels > 50 && swing.right.pixels > 50, 'both swinging hands must remain visible')
    const handSpan = swing.right.x - swing.left.x
    assert(handSpan > standing.measured.headWidth * .35, 'contact poses must retain visible arm swing')
    assert(handSpan < standing.measured.headWidth * .65, 'indoor arm swing must remain restrained')
  }
  const report = await inspectCharacterQuality(directory)
  assert.deepEqual(report.issues.filter(issue => issue.clip === 'walk.right'), [])
})

for (const id of ids) test(`${id}: front/back walking alternates arm swing with stable head and foot registration`, async () => {
  const directory = path.join(staging, id)
  const character = await json(path.join(directory, 'character.json'))
  const standard = await json(path.join(directory, 'standard.json'))
  const quality = await json(path.join(directory, 'quality.json'))
  const readFrame = async file => {
    const { data, info } = await sharp(path.join(directory, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    return { data, measured: measureFrame(data, info.width, info.height, standard.frames[file]) }
  }
  for (const view of ['front', 'back']) {
    const idle = character.clips[`idle.${view}`].frames[0]
    const standing = (await readFrame(idle.file)).measured
    const walk = character.clips[`walk.${view}`]
    assert(walk.loop)
    assert.equal(walk.frames.length, 4)
    const scale = quality.registrations[walk.frames[0].file].scale
    const swings = [], hashes = []
    for (const frame of walk.frames) {
      const { data, measured } = await readFrame(frame.file)
      hashes.push(createHash('sha256').update(data).digest('hex'))
      assert.equal(quality.registrations[frame.file].scale, scale)
      assert(Math.abs(measured.headArea / standing.headArea - 1) <= .035)
      assert(Math.abs(measured.headWidth - standing.headWidth) <= 14)
      assert(Math.abs(measured.headHeight - standing.headHeight) <= 16)
      assert(Math.abs(measured.headCenter - 128) <= 2)
      assert(Math.abs(measured.footY - 344) <= 2)
      if (view === 'front') {
        assert.equal(frame.mouth.view, view)
        assert.equal(frame.mouth.scale, idle.mouth.scale)
        assert(Math.abs((frame.mouth.y - measured.headTop) - (idle.mouth.y - standing.headTop)) < 1e-9)
      }
      swings.push(hands(data, standard.frames[frame.file].headBottom))
    }
    assert.equal(new Set(hashes).size, 4)
    assert(swings[0].right.pixels > swings[0].left.pixels * 1.5, `${view}: A must bring the image-right hand toward camera`)
    assert(swings[2].left.pixels > swings[2].right.pixels * 1.5, `${view}: C must reverse A's arm swing`)
  }
  const report = await inspectCharacterQuality(directory)
  assert.deepEqual(report.issues.filter(issue => ['walk.front', 'walk.back'].includes(issue.clip)), [])
})

test('data-agent work keeps complete authored frames instead of copying rectangular hair and sleeve patches', async () => {
  const directory = path.join(staging, 'data-agent')
  const character = await json(path.join(directory, 'character.json'))
  const provenance = await json(path.join(directory, 'registration-source.json'))
  const quality = await json(path.join(directory, 'quality.json'))
  const clip = character.clips['work.quiet-back']
  assert.equal(clip.frames.length, 4)
  assert(clip.loop)
  const firstRegistration = quality.registrations[clip.frames[0].file]
  const hashes = []
  for (const [index, frame] of clip.frames.entries()) {
    const record = provenance.find(item => item.file === frame.file)
    assert.equal(record.source, 'sources/data-agent-work-v7.png')
    assert.deepEqual(record.crop, { left: index % 2 * 512, top: Math.floor(index / 2) * 768, width: 512, height: 768 })
    assert.deepEqual(quality.registrations[frame.file], firstRegistration)
    assert.deepEqual({ scale: record.scale, x: record.x, y: record.y }, firstRegistration)
    const resized = await sharp(path.join(root, 'art/characters/police-uniform-v1', record.source))
      .extract(record.crop).resize({ width: Math.round(record.crop.width * record.scale) }).png().toBuffer()
    const expected = await sharp({ create: { width: 256, height: 384, channels: 4, background: '#00000000' } })
      .composite([{ input: resized, left: record.x, top: record.y }]).raw().toBuffer()
    const actual = await sharp(path.join(directory, frame.file)).ensureAlpha().raw().toBuffer()
    hashes.push(createHash('sha256').update(actual).digest('hex'))
    let visible = 0, changed = 0
    for (let offset = 0; offset < actual.length; offset += 4) {
      if (expected[offset + 3] < 128 && actual[offset + 3] < 128) continue
      visible++
      if ([0, 1, 2, 3].some(channel => expected[offset + channel] !== actual[offset + channel])) changed++
    }
    // Disconnected transparent-edge debris may be removed, but the figure must stay whole.
    assert(changed / visible < .001, `${frame.file}: full-frame source was modified or patch-composited`)
  }
  assert.equal(new Set(hashes).size, 4, 'keep four genuine typing phases, not a frozen replacement')
})

test('all six desk-ready idle poses reuse a complete neutral work frame without head or hip jumps', async () => {
  for (const id of ids) {
    const character = await json(path.join(staging, id, 'character.json'))
    assert.equal(character.clips['sit.back'].frames.length, 1)
    const neutral = character.clips['work.quiet-back'].frames[0].file
    assert.equal(character.clips['sit.back'].frames[0].file, neutral)
    assert.equal(character.clips['stand-up.back'].frames[0].file, neutral)
    const hashes = []
    for (const frame of character.clips['work.quiet-back'].frames) {
      hashes.push(createHash('sha256').update(await readFile(path.join(staging, id, frame.file))).digest('hex'))
    }
    assert.equal(new Set(hashes).size, 4, 'preserve four typing phases rather than freezing work')
  }
})

test('civic long-haired characters retain natural variation without oversized back-view masters', async () => {
  const sizes = {}
  for (const id of ids) {
    const directory = path.join(staging, id)
    const character = await json(path.join(directory, 'character.json'))
    const standard = await json(path.join(directory, 'standard.json'))
    const frame = character.clips['idle.back'].frames[0]
    const { data, info } = await sharp(path.join(directory, frame.file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    sizes[id] = measureFrame(data, info.width, info.height, standard.frames[frame.file]).headWidth
    assert.equal(character.displayHeight, 84, 'no character-specific runtime display scale')
  }
  const shortHair = (sizes['office-lead'] + sizes['file-agent'] + sizes['review-agent']) / 3
  assert(sizes['app-agent'] <= shortHair * 1.12)
  assert(sizes['data-agent'] <= shortHair * 1.1)
  assert(sizes['app-agent'] > shortHair && sizes['data-agent'] > shortHair, 'retain the long-hair silhouettes')
})

test('civic artwork retains only current source images with matching provenance hashes', async () => {
  const directory = path.join(root, 'art/characters/police-uniform-v1')
  const provenance = await json(path.join(directory, 'provenance.json'))
  const recipe = await json(path.join(directory, 'seating-v10.json'))
  const declared = new Set(provenance.records.map(record => record.source))
  const actual = (await readdir(path.join(directory, 'sources'))).map(file => `sources/${file}`)
  assert.equal(declared.size, provenance.records.length, 'no duplicate source provenance')
  assert.deepEqual(actual.sort(), [...declared].sort())
  const used = new Set([recipe.poseReference.source])
  for (const id of ids) {
    for (const record of await json(path.join(staging, id, 'registration-source.json'))) used.add(record.source)
  }
  assert.deepEqual([...declared].sort(), [...used].sort(), 'no retired source sheet remains')
  for (const record of provenance.records) {
    const bytes = await readFile(path.join(directory, record.source))
    assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256, record.source)
    for (const reference of record.references ?? []) assert(declared.has(reference), reference)
  }
})
