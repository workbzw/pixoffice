import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { alphaBounds } from '../scripts/characters/build.mjs'

async function loadFrames(t) {
  const server = await createTestServer()
  t.after(() => server.close())
  return server.ssrLoadModule('/example/office-web/src/scene/characters/apartmentFrames.ts')
}

const residents = ['office-lead', 'code-agent', 'file-agent', 'app-agent', 'review-agent', 'data-agent']
test('all six current character packs retain four independent transparent running frames', async () => {
  for (const id of residents) {
    const root = new URL(`../art/characters/packs/${id}/`, import.meta.url)
    const source = JSON.parse(await readFile(new URL('character.json', root), 'utf8'))
    const clip = source.clips['run.back'], hashes = new Set()
    assert.equal(clip.loop, true)
    assert.equal(clip.frames.length, 4)
    for (const frame of clip.frames) {
      const png = await readFile(new URL(frame.file, root)), metadata = await sharp(png).metadata()
      assert.equal(metadata.width, source.canvas.width)
      assert.equal(metadata.height, source.canvas.height)
      assert.equal(metadata.hasAlpha, true)
      hashes.add(createHash('sha256').update(png).digest('hex'))
    }
    assert.equal(hashes.size, 4, `${id}: distinct running phases`)
  }
})

test('current indoor walking uses its own calibrated four-phase frames instead of running or idle frames', async () => {
  for (const id of residents) {
    const root = new URL(`../art/characters/packs/${id}/`, import.meta.url)
    const source = JSON.parse(await readFile(new URL('character.json', root), 'utf8'))
    const clip = source.clips['walk.back'], running = new Set(source.clips['run.back'].frames.map(frame => frame.file))
    assert.equal(clip.loop, true)
    assert.deepEqual(clip.frames.map(frame => frame.durationMs), [200, 200, 200, 200])
    const hashes = new Set()
    for (const frame of clip.frames) {
      assert(frame.file.startsWith('standard-v2/walk/back/'))
      assert(!running.has(frame.file))
      hashes.add(createHash('sha256').update(await readFile(new URL(frame.file, root))).digest('hex'))
    }
    assert.equal(hashes.size, 4, `${id}: distinct walking phases`)
  }
})

test('uneven atlas columns never clip hair or leak a neighboring character into a frame', async t => {
  const { detectApartmentFrames, registerWalkFrames } = await loadFrames(t)
  const width = 160, height = 120, rgba = new Uint8Array(width * height * 4)
  const rectangles = []
  for (let row = 0; row < 2; row++) {
    for (const [left, right] of [[29, 45], [52, 72], [90, 111], [127, 150]]) {
      const top = row * 60 + 4, bottom = top + 48 - row * 6
      rectangles.push({ left, right, top, bottom })
      for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) rgba[(y * width + x) * 4 + 3] = 255
    }
  }
  const frames = detectApartmentFrames(rgba, width, height, 2, 4)
  frames.forEach((frame, index) => {
    const rect = rectangles[index]
    assert(frame.x <= rect.left && frame.x + frame.width > rect.right)
    assert(frame.y <= rect.top && frame.y + frame.height > rect.bottom)
    assert(frame.width <= rect.right - rect.left + 5)
  })
  const residents = [0, 1].map(row => registerWalkFrames(rgba, width, height, frames.slice(row * 4, row * 4 + 4)))
  assert(residents[0].frameSize.height > residents[1].frameSize.height, 'registration is per resident, not shared across different people')
  for (const resident of residents) {
    assert.equal(resident.frames.length, 4)
    resident.frames.forEach((frame, index) => {
      assert.equal(frame.height + resident.offsets[index].y, resident.frameSize.height)
    })
  }
})

test('sheet trimming handles uneven rows without cutting off feet or including another pose', async t => {
  const { detectApartmentFrames } = await loadFrames(t)
  const width = 120, height = 160
  const rgba = new Uint8Array(width * height * 4)
  const rectangles = []
  for (const [top, bottom] of [[3, 41], [45, 78], [85, 122], [127, 155]]) {
    for (let col = 0; col < 3; col++) {
      const left = col * 40 + 10
      for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= left + 18; x++) rgba[(y * width + x) * 4 + 3] = 255
      }
      rectangles.push({ left, right: left + 18, top, bottom })
    }
  }
  const frames = detectApartmentFrames(rgba, width, height)
  assert.equal(frames.length, 12)
  for (const [index, frame] of frames.entries()) {
    const rect = rectangles[index]
    assert(frame.x <= rect.left && frame.x + frame.width > rect.right)
    assert(frame.y <= rect.top && frame.y + frame.height > rect.bottom)
    assert(frame.width < 40 && frame.height < 44)
  }
})

test('invalid, opaque and missing-pose sprite sheets fail explicitly', async t => {
  const { detectApartmentFrames } = await loadFrames(t)
  assert.throws(() => detectApartmentFrames(new Uint8Array(1), 120, 160), /dimensions/)
  assert.throws(() => detectApartmentFrames(new Uint8Array(120 * 160 * 4).fill(255), 120, 160), /gutter/)
  assert.throws(() => detectApartmentFrames(new Uint8Array(120 * 160 * 4), 120, 160), /empty/)
})

test('the seated atlas trims six distinct poses in reading order', async t => {
  const { detectApartmentFrames } = await loadFrames(t)
  const width = 120, height = 100
  const rgba = new Uint8Array(width * height * 4)
  for (const top of [3, 54]) {
    for (let col = 0; col < 3; col++) {
      for (let y = top; y < top + 40; y++) {
        for (let x = col * 40 + 8; x < col * 40 + 30; x++) rgba[(y * width + x) * 4 + 3] = 255
      }
    }
  }
  const frames = detectApartmentFrames(rgba, width, height, 2)
  assert.equal(frames.length, 6)
  assert(frames[0].x < frames[1].x && frames[1].x < frames[2].x)
  assert(frames[3].y > frames[0].y)
  assert.throws(() => detectApartmentFrames(rgba, width, height, 0), /dimensions/)
})

test('OfficeLead keeps the same head width through seated, leaning, rising and standing poses', async () => {
  const widths = []
  for (const name of ['idle/back', 'sit/back', 'pose/lean', 'pose/rise', 'talk/seated-right']) {
    const { data, info } = await sharp(new URL(`../art/characters/packs/office-lead/${name}/001.png`, import.meta.url).pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const bounds = alphaBounds(data, info.width, info.height)
    let left = info.width, right = -1
    // These authored OfficeLead poses keep the widest part of the hair in the upper 45%.
    for (let y = bounds.top; y < bounds.top + Math.floor(bounds.height * .45); y++) {
      for (let x = bounds.left; x < bounds.left + bounds.width; x++) {
        if (data[(y * info.width + x) * 4 + 3] < 128) continue
        left = Math.min(left, x); right = Math.max(right, x)
      }
    }
    widths.push(right - left + 1)
    assert(Math.abs((left + right) / 2 - 128) <= 1, `${name}: head stays on the same horizontal pivot`)
  }
  assert(Math.max(...widths) - Math.min(...widths) <= 2, `head widths should agree within raster rounding: ${widths}`)
})


test('walk atlas uses shared scale and head registration despite arm silhouette changes', async t => {
  const { registerWalkFrames, detectApartmentFrames } = await loadFrames(t)
  const width = 160, height = 120
  const rgba = new Uint8Array(width * height * 4)
  const heads = []
  for (let index = 0; index < 8; index++) {
    const col = index % 4, row = Math.floor(index / 4)
    const center = col * 40 + 19 + index % 3
    const top = row * 60 + 4
    const bottom = top + 47 + index % 2
    heads.push(center)
    for (let y = top; y <= bottom; y++) {
      const left = y < top + 23 ? center - 5 : center - 6 - index % 4
      const right = y < top + 23 ? center + 5 : center + 8
      for (let x = left; x <= right; x++) rgba[(y * width + x) * 4 + 3] = 255
    }
  }
  const { frames, frameSize, offsets } = registerWalkFrames(rgba, width, height)
  assert.equal(frames.length, 8)
  const registeredHeads = frames.map((frame, index) => heads[index] - frame.x + offsets[index].x)
  assert.equal(new Set(registeredHeads).size, 1)
  frames.forEach((frame, index) => {
    assert(offsets[index].x >= 0 && offsets[index].y >= 0)
    assert(offsets[index].x + frame.width <= frameSize.width)
    assert.equal(offsets[index].y + frame.height, frameSize.height)
  })
  assert.throws(() => detectApartmentFrames(rgba, width, height, 2, 0), /dimensions/)
  assert.throws(() => registerWalkFrames(new Uint8Array(rgba.length).fill(255), width, height), /gutter/)
})
