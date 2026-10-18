import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import sharp from 'sharp'
import { createTestServer } from './helpers/vite.mjs'

let server
before(async () => { server = await createTestServer() })
after(async () => { await server?.close() })
const load = path => server.ssrLoadModule(path)

test('office preview uses shared runtime to visit all five desks without entering their footprints', async t => {
  const { StudioEngine } = await load('/example/dimetric/src/studio/engine.ts')
  const { workers } = await load('/example/dimetric/src/studio/data.ts')
  const engine = new StudioEngine(); t.after(() => engine.dispose())
  const seen = new Set()
  for (let i = 0; i < 10000; i++) {
    engine.tick(50)
    const point = engine.runtime.readActors()[0].position
    for (const worker of workers) {
      assert(!(point.x >= worker.position.x && point.x < worker.position.x + 2 && point.y >= worker.position.y && point.y < worker.position.y + 2), `helper entered ${worker.id}`)
      if (point.x === worker.position.x + 1 && point.y === worker.position.y + 2) seen.add(worker.id)
    }
    if (seen.size === 5) break
  }
  assert.equal(seen.size, 5)
})

test('pause freezes progress and movement; conflict requires confirmation; restart clears demo state', async t => {
  const { StudioEngine } = await load('/example/dimetric/src/studio/engine.ts')
  const engine = new StudioEngine(); t.after(() => engine.dispose())
  for (let i = 0; i < 100; i++) engine.tick(50)
  engine.setRunning(false)
  const before = engine.snapshot(), actorBefore = engine.runtime.readActors()[0]
  engine.tick(100)
  assert.deepEqual(engine.snapshot(), before)
  assert.deepEqual(engine.runtime.readActors()[0], actorBefore)
  engine.setRunning(true)
  for (let i = 0; i < 100; i++) engine.tick(50)
  assert.equal(engine.snapshot().tasks.find(t => t.workerId === 'zhou').progress, 46)
  engine.resolveConflict(); engine.resolveConflict()
  assert.equal(engine.snapshot().log.filter(l => l.text.startsWith('已确认')).length, 1)
  engine.tick(100)
  assert(engine.snapshot().tasks.find(t => t.workerId === 'zhou').progress > 46)
  engine.restart()
  assert.equal(engine.snapshot().elapsed, 0)
  assert.equal(engine.snapshot().tasks.find(t => t.workerId === 'zhou').status, 'blocked')
  assert.equal(engine.snapshot().log.length, 1)
})

test('preview report distinguishes demo data and tracks actual local task state', async t => {
  const { StudioEngine } = await load('/example/dimetric/src/studio/engine.ts')
  const { reportText } = await load('/example/dimetric/src/studio/data.ts')
  const engine = new StudioEngine(); t.after(() => engine.dispose())
  engine.resolveConflict()
  for (let i = 0; i < 4000; i++) engine.tick(100)
  assert.equal(engine.snapshot().completed, 5)
  assert.equal(engine.snapshot().progress, 100)
  const report = reportText(engine.snapshot())
  assert.match(report, /不代表真实调研结果/)
  assert.equal((report.match(/：已完成 \(100%\)/g) || []).length, 5)
})

test('preview artwork preserves transparent frames and stable sheet geometry', async () => {
  for (const [name, width, height, alpha] of [['room', 1536, 1024, false], ['stations', 1536, 1024, true], ['board-v2', 1448, 1086, true], ['robot', 1254, 1254, true], ['portraits', 1536, 1024, true]]) {
    const metadata = await sharp(new URL(`../example/dimetric/art/studio-v1/${name}.png`, import.meta.url).pathname).metadata()
    assert.equal(metadata.width, width); assert.equal(metadata.height, height); assert.equal(metadata.hasAlpha, alpha)
  }
})
