import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSceneGateway } from '../scripts/scene-gateway.mjs'

const command = id => ({ protocolVersion: '1.0', sceneId: 'office-1', commandId: id, type: 'actor.presentation.set', actorId: 'marvis', status: 'working', title: 'test', sourceRevision: 1 })
function setup() {
  let now = 0
  const handler = createSceneGateway({ now: () => now })
  const request = async (path, method = 'GET', body, owner = 'runtime-one') => {
    let result
    await handler({ method, headers: { 'x-scene-runtime': owner } }, {}, new URL(path, 'http://localhost'), (_res, status, data) => { result = { status, data } }, async () => JSON.stringify(body))
    return result
  }
  return { request, advance: ms => { now += ms }, connect: (owner = 'runtime-one') => request('/scene/connect', 'POST', { runtimeId: owner, sceneId: 'office-1' }, owner) }
}

test('relay command reads are non-destructive; receipts and final events are separate', async () => {
  const { request, connect } = setup()
  await connect()
  const created = await request('/scene/commands', 'POST', command('c1'))
  assert.equal(created.status, 202)
  assert.equal((await request('/scene/commands')).data.commands.length, 1)
  assert.equal((await request('/scene/commands')).data.commands.length, 1)
  await request('/scene/receipts', 'POST', { receipts: [{ cursor: created.data.cursor, results: [{ commandId: 'c1', status: 'queued' }] }] })
  assert.equal((await request('/scene/commands')).data.commands.length, 0)
  assert.equal((await request('/scene/commands/c1')).data.status, 'queued')
  const event = { runtimeId: 'runtime-one', eventId: 'e1', type: 'command.status', data: { commandId: 'c1', status: 'completed' } }
  await request('/scene/events', 'POST', { events: [event] })
  await request('/scene/events', 'POST', { events: [event] })
  assert.equal((await request('/scene/events')).data.events.length, 1)
  assert.equal((await request('/scene/commands/c1')).data.status, 'completed')
})

test('relay rejects second owner and late writes after lease takeover', async () => {
  const { request, connect, advance } = setup()
  assert.equal((await connect()).status, 200)
  assert.equal((await connect('runtime-two')).status, 409)
  assert.equal((await request('/scene/commands', 'GET', undefined, 'runtime-two')).status, 409)
  advance(10001)
  assert.equal((await connect('runtime-two')).status, 200)
  assert.equal((await request('/scene/state', 'PUT', {})).status, 409)
  assert.equal((await request('/scene/receipts', 'POST', { receipts: [] })).status, 409)
})

test('relay deduplicates canonical content and rejects changed payloads and duplicate batches', async () => {
  const { request } = setup()
  assert.equal((await request('/scene/commands', 'POST', command('c1'))).status, 202)
  assert.equal((await request('/scene/commands', 'POST', Object.fromEntries(Object.entries(command('c1')).reverse()))).status, 200)
  assert.equal((await request('/scene/commands', 'POST', { ...command('c1'), title: 'different' })).status, 409)
  assert.equal((await request('/scene/commands', 'POST', { mode: 'parallel', commands: [command('c2'), command('c2')] })).status, 400)
})

test('gateway restarts expose a new epoch so clients reset transport cursors', async () => {
  const a = await setup().connect(), b = await setup().connect()
  assert.equal(typeof a.data.epoch, 'string')
  assert.notEqual(a.data.epoch, b.data.epoch)
})
