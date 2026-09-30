import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'

let server, createOfficeRuntime, SeatInteractions, actorPixels, seatStepPixels, seatStepDurationMs, projectAgents, computeAgentDepthZ
before(async () => {
  server = await createTestServer()
  ;({ createOfficeRuntime } = await server.ssrLoadModule('/src/runtime/createOfficeRuntime.ts'))
  ;({ SeatInteractions } = await server.ssrLoadModule('/src/runtime/seatInteraction.ts'))
  ;({ actorPixels, seatStepPixels, seatStepDurationMs } = await server.ssrLoadModule('/src/scene/gridProjection.ts'))
  ;({ projectAgents } = await server.ssrLoadModule('/src/runtime/adapters/legacy.ts'))
  ;({ computeAgentDepthZ } = await server.ssrLoadModule('/src/scene/systems/deskDepthSort.ts'))
})
after(() => server?.close())

function setup(actorIndex = 0) {
  const runtime = createOfficeRuntime({ seatStepDuration: seatStepDurationMs }), world = runtime.readWorld(), actor = world.actors[actorIndex]
  const seats = new SeatInteractions(runtime.navigation, { template: id => runtime.template(id) }, seatStepDurationMs)
  const seated = actorPixels(actor)
  return { runtime, world, actor, seats, seated }
}

test('all six actors walk into aligned seats at the same speed as normal floor movement', () => {
  for (let actorIndex = 0; actorIndex < 6; actorIndex++) for (let entrance = 0; entrance < 2; entrance++) {
    const { runtime, world, actor, seats, seated } = setup(actorIndex)
    try {
      const port = seats.ports(world, actor.homeId)[entrance]
      if (!port) continue // Entrances outside the room are not offered by the runtime.
      for (let i = 1; i < port.passage.length; i++) {
        const from = port.passage[i - 1], to = port.passage[i]
        const path = seatStepPixels(from, to, port)
        assert.deepEqual(seatStepPixels(to, from, port), [...path].reverse())
        path.slice(1).forEach((p, j) => assert(p.x === path[j].x || p.y === path[j].y, 'every visual path segment is axis-aligned'))
      }
      Object.assign(actor, { position: { ...port.approach }, posture: 'standing', using: undefined })
      for (const direction of ['enter', 'exit']) {
        seats.begin(actor, port, direction)
        let previous = actorPixels(actor)
        const headings = new Set()
        for (let frame = 0; frame < 400 && actor.seatTransition; frame++) {
          const previousStage = actor.seatTransition.stage
          seats.advance(world, actor, 16)
          const next = actorPixels(actor), projected = projectAgents(runtime, false, world)[actorIndex]
          assert(Math.hypot(next.x - previous.x, next.y - previous.y) < 8, 'docking and posture changes must not teleport')
          if (['entering', 'exiting'].includes(actor.seatTransition?.stage)) {
            assert(next.y >= (port.seat.y + .5) * 50, 'walking feet must stay on the floor, never rise toward the tabletop')
            const dx = next.x - previous.x, dy = next.y - previous.y
            if (previousStage === actor.seatTransition.stage) {
              const distance = Math.abs(dx) + Math.abs(dy)
              if (distance > .001) assert(Math.abs(distance - 50 / 480 * 16) < .001, `${direction} entrance ${entrance} changed walking speed`)
              if (Math.abs(dx) > .001 && Math.abs(dy) < .001) assert.equal(projected.viewFacing, dx < 0 ? 'left' : 'right')
              if (Math.abs(dy) > .001 && Math.abs(dx) < .001) assert.equal(projected.viewFacing, dy < 0 ? 'back' : 'front')
            }
            headings.add(projected.viewFacing)
          }
          previous = next
        }
        assert.equal(actor.seatTransition, undefined)
        if (direction === 'enter') {
          assert.deepEqual(actorPixels(actor), seated)
          assert(!headings.has('front'), 'entry never reverses into a front-facing spin')
        }
      }
      assert.deepEqual(actorPixels(actor), { x: (port.approach.x + .5) * 50, y: (port.approach.y + .5) * 50 })
    } finally { runtime.dispose() }
  }
})

test('sitting is in place after walking has aligned the actor with the seat', () => {
  for (let entrance = 0; entrance < 2; entrance++) {
    const { runtime, world, actor, seats, seated } = setup()
    try {
      const port = seats.ports(world, actor.homeId)[entrance]
      Object.assign(actor, { position: { ...port.approach }, posture: 'standing', using: undefined })
      seats.begin(actor, port, 'enter')
      for (let frame = 0; frame < 400 && actor.seatTransition?.stage !== 'sitting'; frame++) seats.advance(world, actor, 16)
      assert.equal(actor.seatTransition?.stage, 'sitting')
      const stand = actorPixels(actor)
      assert.equal(stand.y, (port.seat.y + .5) * 50)
      assert.equal(stand.x, seated.x)
      while (actor.seatTransition) {
        seats.advance(world, actor, 16)
        const next = actorPixels(actor)
        assert(next.y >= seated.y, 'posture animation stays below the seated pivot')
        assert.equal(next.x, seated.x, 'sitting must not add a sideways slide')
      }
      assert.deepEqual(actorPixels(actor), seated)
    } finally { runtime.dispose() }
  }
})

test('a standing actor below the chair keeps normal depth instead of being hidden early', () => {
  const seat = { x: 350, y: 265 }
  assert.equal(computeAgentDepthZ({ x: 325, y: 310, seatTransition: { stage: 'entering', seat } }), 310)
  assert.equal(computeAgentDepthZ({ x: 350, y: 275, seatTransition: { stage: 'entering', seat } }), 266)
  assert.equal(computeAgentDepthZ({ x: 394, y: 275, seatTransition: { stage: 'entering', seat } }), 275)
})

test('cancelling a docking transition preserves its visual position while recovering', () => {
  for (let entrance = 0; entrance < 2; entrance++) for (const direction of ['enter', 'exit']) {
    for (const delay of [64, 384, 768, 1152]) {
      const { runtime, world, actor, seats } = setup()
      try {
        const port = seats.ports(world, actor.homeId)[entrance]
        if (direction === 'enter') Object.assign(actor, { position: { ...port.approach }, posture: 'standing', using: undefined })
        seats.begin(actor, port, direction)
        for (let elapsed = 0; elapsed < delay && actor.seatTransition; elapsed += 16) seats.advance(world, actor, 16)
        if (!actor.seatTransition) continue
        let previous = actorPixels(actor)
        seats.recover(actor)
        assert.deepEqual(actorPixels(actor), previous)
        for (let frame = 0; frame < 500 && actor.seatTransition; frame++) {
          seats.advance(world, actor, 16, true)
          const next = actorPixels(actor)
          assert(Math.hypot(next.x - previous.x, next.y - previous.y) < 8)
          previous = next
        }
        assert.equal(actor.seatTransition, undefined)
      } finally { runtime.dispose() }
    }
  }
})
