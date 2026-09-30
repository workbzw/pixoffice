import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { safeTick } from './helpers/grid.mjs'
import { createTestServer } from './helpers/vite.mjs'

let server, OfficeScene, createOfficeRuntime, demoPairs
before(async () => {
  server = await createTestServer()
  ;({ OfficeScene } = await server.ssrLoadModule('/src/scene/OfficeScene.ts'))
  ;({ createOfficeRuntime } = await server.ssrLoadModule('/src/runtime/createOfficeRuntime.ts'))
  ;({ demoPairs } = await server.ssrLoadModule('/src/scene/systems/officeDemo.ts'))
})
after(() => server?.close())

function fixture(t, options = {}) {
  let now = 0
  const runtime = createOfficeRuntime({ now: () => now })
  const scene = new OfficeScene({ runtime, ...options })
  t.after(() => { scene.destroy(); runtime.dispose() })
  return { scene, runtime, tick(ms = 50) { now += ms; scene.onTick({ deltaTime: 3 }) } }
}

test('demo pairs cover every directed colleague pair, reverse visits and support an odd roster', t => {
  const { runtime } = fixture(t)
  for (const count of [2, 5, 6]) {
    const actors = runtime.readActors().slice(0, count), seen = new Set()
    const rounds = 2 * (count % 2 ? count : count - 1)
    for (let round = 0; round < rounds; round++) {
      const pairs = demoPairs(actors, round), ids = pairs.flatMap(pair => pair.map(actor => actor.id))
      assert.equal(ids.length, Math.floor(count / 2) * 2)
      assert.equal(new Set(ids).size, ids.length, 'no actor participates in two concurrent visits')
      for (const [a, b] of pairs) seen.add(`${a.id}->${b.id}`)
      if (round % 2) assert.deepEqual(pairs.map(([a, b]) => [b.id, a.id]), demoPairs(actors, round - 1).map(pair => pair.map(a => a.id)))
    }
    assert.equal(seen.size, count * (count - 1))
    assert.deepEqual(demoPairs(actors, rounds), demoPairs(actors, 0))
  }
  const actors = runtime.readActors().slice(0, 2)
  delete actors[0].homeId
  assert.deepEqual(demoPairs(actors, 0), [])
})

test('ten demo rounds complete all thirty visits with parallel walking, replies and no collisions', t => {
  const { scene, runtime, tick } = fixture(t)
  const walked = new Set(), spoke = new Set()
  let maxMoving = 0, maxActive = 0, records = []
  scene.setDemo(true)
  for (let i = 0; i < 20000; i++) {
    safeTick(runtime, 50, () => tick())
    const snapshot = runtime.snapshot(), actors = snapshot.world.actors
    records = snapshot.records
    for (const record of records) assert.equal(record.error, undefined, JSON.stringify({ round: scene.demoRound, record }))
    maxActive = Math.max(maxActive, snapshot.activities.filter(a => a.status === 'active').length)
    let moving = 0
    for (const actor of actors) {
      if (actor.step) { moving++; walked.add(actor.id) }
      if (actor.speech) spoke.add(actor.id)
    }
    maxMoving = Math.max(maxMoving, moving)
    if (records.length >= 30 && scene.isDemoRunning) scene.setDemo(false)
    if (records.length === 30 && records.every(record => record.status === 'completed')) break
  }
  assert.equal(records.length, 30)
  assert(records.every(record => record.status === 'completed'), JSON.stringify(records.filter(record => record.status !== 'completed')))
  assert.equal(walked.size, 6)
  assert.equal(spoke.size, 6)
  assert(maxMoving >= 2, 'more than one visitor should walk at the same time')
  assert.equal(maxActive, 3)
  assert(runtime.readActors().every(actor => actor.posture === 'seated' && !actor.motion && !actor.seatTransition))
  for (let i = 0; i < 100; i++) tick()
  assert.equal(runtime.snapshot().records.length, 30, 'stopping demo never starts another round')
})

test('demo waits for manual running and queued visits before starting its next round', t => {
  const { scene, runtime, tick } = fixture(t)
  const first = scene.requestDeskVisit(1, 2, 'manual'), queued = scene.requestDeskVisit(2, 1, 'queued')
  assert.equal(queued.status, 'queued')
  scene.setDemo(true)
  for (let i = 0; i < 2400; i++) {
    if (runtime.getRecord(queued.commandId).status === 'completed') break
    assert.equal(runtime.snapshot().records.length, 2)
    tick()
  }
  assert.equal(runtime.getRecord(first.commandId).status, 'completed')
  assert.equal(runtime.getRecord(queued.commandId).status, 'completed')
  tick()
  assert.equal(runtime.snapshot().records.length, 5)
})

test('an asynchronous demo failure stops scheduling instead of silently retrying', t => {
  const notices = [], { scene, runtime, tick } = fixture(t, { onDraftChange: text => notices.push(text) })
  scene.setDemo(true); tick()
  assert.equal(runtime.snapshot().records.length, 3)
  tick(120001)
  assert.equal(scene.isDemoRunning, false)
  assert(notices.some(text => text.includes('执行期限')))
  for (let i = 0; i < 100; i++) tick()
  assert.equal(runtime.snapshot().records.length, 3)
})
