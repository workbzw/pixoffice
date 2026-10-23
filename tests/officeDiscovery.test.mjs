import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createPixOfficeServer, DEMO_API_KEY } from '../server/dist/app.js'
import { officeSnapshotSchema, officeWorkspaceResultSchema, unavailableOfficeRuntime } from '@pixoffice/protocol/office-integration'
import { assertProtocolObject } from '@pixoffice/protocol/schema'

const require = createRequire(import.meta.url)
const Ajv = createRequire(require.resolve('@fastify/ajv-compiler'))('ajv/dist/2020.js').default
const post = (app, payload) => app.inject({ method: 'POST', url: '/api/pixoffice/messages', headers: { authorization: `Bearer ${DEMO_API_KEY}` }, payload })
async function setup(t, options = {}) {
  const app = await createPixOfficeServer(options)
  t.after(() => app.close())
  return app
}
const snapshot = () => ({ schemaVersion: '1.0', seq: 1, workspace: { id: 'team-a', name: '电商工作区' }, conversations: [
  { id: 'launch', title: '商品上架', employees: [{ id: 'writer', name: '文案', sceneActorId: 'office-lead' }],
    tasks: [{ id: 'title', title: '优化标题', status: 'running', assigneeId: 'writer', updatedAt: '2026-10-24T08:00:00Z' }],
    whiteboard: { title: '准备上架', status: 'running' } },
  { id: 'review', title: '经营复盘', whiteboard: { title: '复盘转化', status: 'queued' } },
] })

test('initialization and discovery expose one complete contract and authoritative multi-conversation state', async t => {
  const app = await setup(t, { officeRequestMs: 12345, chatTimeoutMs: 23456 })
  const before = (await post(app, { type: 'office.read' })).json()
  assert.deepEqual(before.data.state.offices, [])
  assert.equal(before.data.state.chat.configured, false)
  const initial = await post(app, { type: 'offices.initialize', layoutId: 'members', offices: [snapshot()], chat: { url: 'https://private-chat.example/secret-path' } })
  assert.equal(initial.statusCode, 202)
  const { data } = initial.json(), { capabilities, state } = data
  assert.deepEqual(Object.keys(data).sort(), ['capabilities', 'state'])
  assert(officeWorkspaceResultSchema.safeParse(data).success)
  assert.deepEqual(capabilities, before.data.capabilities)
  assert.deepEqual(capabilities, (await post(app, { type: 'office.capabilities' })).json().data)
  assert.deepEqual(state.layout, { currentLayoutId: 'members', revision: 1 })
  assert.deepEqual(state.chat, { configured: true })
  assert.deepEqual(state.offices, [{ snapshot: officeSnapshotSchema.parse(snapshot()), runtime: unavailableOfficeRuntime() }])
  assert.deepEqual((await post(app, { type: 'office.read', teamId: 'team-a' })).json().data, state.offices[0])
  assert.deepEqual((await post(app, { type: 'office.read' })).json().data, data)
  assert(!initial.body.includes('private-chat.example')); assert(!initial.body.includes(DEMO_API_KEY))
  assert.equal(capabilities.http.businessTimeoutMs, 12345)
  assert.deepEqual(capabilities.chat.operations.map(item => item.timeoutMs), [23456, 15000, 23456, 15000])
  assert.equal(capabilities.scene.actors.length, 6)
  assert(capabilities.scene.actors.every(actor => !('position' in actor)))
  assert(capabilities.scene.objects.every(object => !('state' in object)))
  const desk = capabilities.scene.objects.find(object => object.id === 'desk-0')
  assert.deepEqual(desk.interactions, [{ id: 'seat', name: '入座工作', requiresHome: true, actorIds: ['office-lead'] }])
  const board = capabilities.scene.objects.find(object => object.id === 'whiteboard-1')
  assert.deepEqual(board.interactions[0], { id: 'write', name: '查看白板', requiresHome: false, actorIds: capabilities.scene.actors.map(actor => actor.id) })
  assert.deepEqual(capabilities.scene.objects.find(object => object.id === 'conference-table-1').interactions, [])
  const classic = capabilities.layouts.find(item => item.id === 'classic'), members = capabilities.layouts.find(item => item.id === 'members')
  assert(classic.ui.slots.includes('actor.insights')); assert(classic.ui.actions.includes('actor.inspect'))
  assert(!members.ui.slots.includes('actor.insights')); assert(!members.ui.actions.includes('actor.inspect'))
  assert(members.ui.actions.includes('employee.inspect'))
  assert.deepEqual((await post(app, { type: 'office.layout.read' })).json().data.layouts, capabilities.layouts)
  assertProtocolObject(initial.json())
  t.diagnostic(`Complete initialization response: ${Buffer.byteLength(initial.body)} bytes`)
})

test('an independent JSON Schema consumer validates requests and their mapped responses from discovery alone', async t => {
  const app = await setup(t), result = (await post(app, { type: 'office.read' })).json(), c = result.data.capabilities
  const ajv = new Ajv({ strict: false, validateFormats: false, allErrors: true, logger: false })
  const validate = (schema, value) => { const check = ajv.compile(schema); assert(check(value), JSON.stringify(check.errors)) }
  const request = { type: 'offices.initialize', offices: [snapshot()] }
  validate(c.requests, request)
  const initialized = (await post(app, request)).json()
  validate(c.responses.envelope, initialized)
  const variants = c.responses.operations
  for (const type of c.supportedMessages) assert(variants.some(item => item.type === type))
  for (const [type, scope, data] of [
    ['offices.initialize', 'operation', initialized.data], ['office.read', 'workspace', initialized.data],
    ['office.read', 'office', initialized.data.state.offices[0]], ['office.capabilities', 'operation', c],
  ]) validate(variants.find(item => item.type === type && item.scope === scope).dataSchema, data)
  for (const layout of c.layouts) validate(layout.dataSchema, snapshot())
  validate(c.requests, { type: 'chat.updated', teamId: 'team-a', conversationId: 'launch' })
  const notified = await post(app, { type: 'chat.updated', teamId: 'team-a', conversationId: 'launch' })
  assert.equal(notified.statusCode, 503, 'a notification cannot claim success before a chat service is configured')
  validate(c.responses.operations.find(item => item.type === 'chat.updated').dataSchema, { teamId: 'team-a', conversationId: 'launch', forwarded: 0 })
  for (const kind of ['confirmation', 'choice']) validate(c.requests, { type: 'decision.request', teamId: 'team-a', conversationId: 'launch', decision: {
    id: `approve-${kind}`, kind, title: '是否上架？', ...(kind === 'choice' ? { options: [{ id: 'a', label: '方案甲' }, { id: 'b', label: '方案乙' }] } : {}),
  } })
  validate(c.animation.requestSchema, { teamId: 'team-a', command: { protocolVersion: '2.0', sceneId: 'team-a', commandId: 'hello', type: 'activity.start',
    capability: 'scene.say', participants: [{ entityId: c.scene.actors[0].id, role: 'actor' }], params: { text: '开始工作' } } })
  validate(c.animation.responseSchema, { code: 200, msg: 'Forwarded', data: { forwarded: 1 } })
  const desk = c.scene.objects.find(object => object.interactions.some(interaction => interaction.requiresHome)), interaction = desk.interactions[0]
  const furniture = { objectId: desk.id, interactionId: interaction.id, durationMs: 1000 }
  validate(c.scene.capabilities.find(item => item.id === 'furniture.use').params, furniture)
  validate(c.animation.requestSchema, { teamId: 'team-a', command: { protocolVersion: '2.0', sceneId: 'team-a', commandId: 'seat', type: 'activity.start',
    capability: 'furniture.use', participants: [{ entityId: interaction.actorIds[0], role: 'user' }], params: furniture } })
  const identity = { version: '1.0', teamId: 'team-a', conversationId: 'launch' }
  const examples = {
    send: { ...identity, type: 'send', turnId: 'turn', messages: [{ role: 'user', content: '现在进展如何？' }] },
    history: { ...identity, type: 'history', cursor: '', limit: 20 },
    resume: { ...identity, type: 'resume', turnId: 'turn' }, cancel: { ...identity, type: 'cancel', turnId: 'turn' },
  }
  for (const operation of c.chat.operations) {
    validate(c.chat.requests, examples[operation.type]); validate(operation.requestSchema, examples[operation.type])
    const response = operation.type === 'history' ? { code: 200, msg: 'OK', data: { turns: [], nextCursor: '', hasMore: false, activeTurnId: '' } }
      : operation.type === 'cancel' ? { code: 200, msg: 'OK', data: { stopped: true } }
        : { type: 'snapshot', text: '处理中', state: 'pending', message: '' }
    validate(operation.responseSchema, response)
  }
  validate(c.responses.error, { reasonCode: 'NO_RECEIVER', details: {}, issues: [] })
})

test('the read-only external example consumes the real HTTP discovery response without application imports', async t => {
  const app = await setup(t), base = await app.listen({ host: '127.0.0.1', port: 0 })
  const { stdout } = await promisify(execFile)(process.execPath, ['integration/clients/discovery-client.mjs'], {
    cwd: new URL('../', import.meta.url), env: { ...process.env, PIXOFFICE_URL: base, PIXOFFICE_API_KEY: DEMO_API_KEY }, maxBuffer: 4 * 1024 * 1024,
  })
  const result = JSON.parse(stdout)
  assert.equal(result.code, 200); assert.equal(result.data.capabilities.chat.operations.length, 4)
  assert.deepEqual(result.data.state.offices, [])
})
