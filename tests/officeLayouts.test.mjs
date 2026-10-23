import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createPixOfficeServer, DEMO_API_KEY } from '../server/dist/app.js'
import { OfficeLayouts } from '../server/dist/officeLayouts.js'
import { officeLayoutInfoSchema, officeRequestSchema, describeOfficeLayouts } from '@pixoffice/protocol/office-integration'
import { assertProtocolObject } from '@pixoffice/protocol/schema'
import { createTestServer } from './helpers/vite.mjs'

let vite, requestOfficeLayout
before(async () => {
  vite = await createTestServer()
  ;({ requestOfficeLayout } = await vite.ssrLoadModule('/example/office-web/src/application/requestOfficeLayout.ts'))
})
after(() => vite?.close())
const post = (app, payload, headers = { authorization: `Bearer ${DEMO_API_KEY}` }) => app.inject({ method: 'POST', url: '/api/pixoffice/messages', headers, payload })
const office = () => ({ schemaVersion: '1.0', seq: 1, workspace: { id: 'office-a', name: '研发' }, conversations: [{ id: 'main', title: '主会话' }] })

test('layout discovery works before initialization and reports each layout data contract', async t => {
  const app = await createPixOfficeServer(); t.after(() => app.close())
  const response = await post(app, { type: 'office.layout.read' })
  assert.equal(response.statusCode, 200)
  const info = officeLayoutInfoSchema.parse(response.json().data)
  assert.equal(info.currentLayoutId, 'classic'); assert.equal(info.revision, 0)
  assert.deepEqual(info.layouts.map(layout => layout.id), ['classic', 'members'])
  for (const layout of info.layouts) {
    assert.equal(layout.dataMessageType, 'office.snapshot')
    assert.equal(layout.dataSchema.type, 'object')
    assert(layout.dataSchema.required.includes('seq'))
    assert(layout.dataSchema.properties.conversations)
  }
  const capabilities = (await post(app, { type: 'office.capabilities' })).json().data
  assert.deepEqual(capabilities.layouts, info.layouts)
  assertProtocolObject(response.json())
  assert.equal((await post(app, { type: 'office.layout.read' }, {})).statusCode, 401)
  for (const layoutId of ['missing', null, 1]) {
    assert.equal((await post(app, { type: 'office.layout.set', layoutId })).statusCode, 400)
  }
  assert.equal((await post(app, { type: 'office.layout.read' })).json().data.currentLayoutId, 'classic')
})

test('offline initialization and layout selection share state without resetting it on business updates', async t => {
  const app = await createPixOfficeServer(); t.after(() => app.close())
  const initialized = await post(app, { type: 'offices.initialize', offices: [office()], layoutId: 'members' })
  assert.equal(initialized.statusCode, 202)
  assert.equal(initialized.json().data.state.layout.currentLayoutId, 'members')
  assert.equal(initialized.json().data.state.layout.revision, 1)
  assert.deepEqual(initialized.json().data.capabilities.layouts, describeOfficeLayouts().layouts)
  await post(app, { type: 'offices.initialize', offices: [] })
  const next = office(); next.seq = 2
  await post(app, { type: 'office.snapshot', teamId: 'office-a', snapshot: next })
  const selected = await post(app, { type: 'office.layout.read' })
  assert.equal(selected.json().data.currentLayoutId, 'members'); assert.equal(selected.json().data.revision, 1)
  const switched = await post(app, { type: 'office.layout.set', layoutId: 'classic' })
  assert.equal(switched.statusCode, 202)
  assert.equal(switched.json().data.currentLayoutId, 'classic'); assert.equal(switched.json().data.revision, 2)
  assert.equal((await post(app, { type: 'office.read' })).json().data.state.offices[0].snapshot.seq, 2)
  const repeated = await post(app, { type: 'office.layout.set', layoutId: 'classic' })
  assert.equal(repeated.json().data.revision, 2, 'retries do not create a second layout change')
})

test('browser layout controls use the same state with same-origin checks and no external API key', async t => {
  const app = await createPixOfficeServer(); t.after(() => app.close())
  const payload = { type: 'office.layout.set', layoutId: 'members' }
  const request = headers => app.inject({ method: 'POST', url: '/api/pixoffice/layout', headers, payload })
  assert.equal((await request({ origin: 'https://bad.example', 'sec-fetch-site': 'cross-site' })).statusCode, 403)
  assert.equal((await post(app, { type: 'office.layout.read' })).json().data.currentLayoutId, 'classic')
  assert.equal((await request({})).statusCode, 200)
  const actual = (await post(app, { type: 'office.layout.read' })).json().data
  assert.equal(actual.currentLayoutId, 'members'); assert.equal(actual.revision, 1)
})

test('layout state is instance-local and layout contracts reject invalid or conflicting catalogues', () => {
  const a = new OfficeLayouts(), b = new OfficeLayouts()
  a.select('members')
  assert.equal(b.read().currentLayoutId, 'classic')
  assert.equal(b.read().revision, 0)
  const selection = a.read(); selection.currentLayoutId = 'classic'
  assert.equal(a.read().currentLayoutId, 'members', 'callers cannot mutate the stored selection')
  const info = describeOfficeLayouts()
  assert.equal(officeLayoutInfoSchema.safeParse({ ...info, layouts: [] }).success, false)
  assert.equal(officeLayoutInfoSchema.safeParse({ ...info, layouts: [info.layouts[0], info.layouts[0]] }).success, false)
  assert.equal(officeLayoutInfoSchema.safeParse({ ...info, currentLayoutId: 'members', layouts: [info.layouts[0]] }).success, false)
  assert.equal(officeRequestSchema.safeParse({ type: 'office.snapshot', teamId: 'office-a', snapshot: { ...office(), layoutId: 'classic' } }).success, false)
  assert.equal(officeRequestSchema.safeParse({ type: 'office.layout.set', layoutId: 'members', revision: 999 }).success, false)
})

test('browser layout client validates responses and sends only the selected layout', async t => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options })
    return new Response(JSON.stringify({ code: 200, msg: 'OK', data: describeOfficeLayouts({ currentLayoutId: 'members', revision: 2 }) }))
  })
  assert.deepEqual(await requestOfficeLayout('https://office.example/', 'members'), { currentLayoutId: 'members', revision: 2 })
  assert.equal(calls[0].url, 'https://office.example/api/pixoffice/layout')
  assert.deepEqual(JSON.parse(calls[0].options.body), { type: 'office.layout.set', layoutId: 'members' })
  assert.equal(Object.hasOwn(calls[0].options.headers, 'Authorization'), false)
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ code: 200, msg: '', data: [] })))
  await assert.rejects(requestOfficeLayout('https://office.example', 'members'))
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ code: 403, msg: 'Forbidden', data: { reasonCode: 'FORBIDDEN' } }), { status: 403 }))
  await assert.rejects(requestOfficeLayout('https://office.example', 'members'), /FORBIDDEN/)
})
