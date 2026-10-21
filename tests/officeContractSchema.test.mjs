import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { officeErrorResultSchema, officeMessageSchema, officeSnapshotSchema } from '@pixoffice/protocol/office-integration'
import { createPixOfficeServer, DEMO_API_KEY } from '../server/dist/app.js'

const require = createRequire(import.meta.url)
const Ajv = createRequire(require.resolve('@fastify/ajv-compiler'))('ajv/dist/2020.js').default
const validator = () => new Ajv({ strict: false, validateFormats: false, allErrors: true, logger: false })
const minimal = () => ({ schemaVersion: '1.0', seq: 1, workspace: { id: 'schema-office', name: '契约检查' } })
async function capabilities(t) {
  const app = await createPixOfficeServer(); t.after(() => app.close())
  const response = await app.inject({ method: 'POST', url: '/api/pixoffice/messages', headers: { authorization: `Bearer ${DEMO_API_KEY}` }, payload: { type: 'office.capabilities' } })
  assert.equal(response.statusCode, 200)
  return response.json().data
}

test('published request schemas accept omitted defaults and explicit empty references without weakening required identities', async t => {
  const data = await capabilities(t), validate = validator().compile(data.requests)
  const sparse = { ...minimal(), employees: [{ id: 'dev', name: '开发' }], tasks: [{ id: 'task', title: '待分配任务', status: 'queued', updatedAt: '2026-10-18T10:00:00Z' }],
    events: [{ id: 'note', kind: 'note', summary: '项目动态', occurredAt: '2026-10-18T10:00:00Z' }] }
  for (const request of [
    { type: 'office.read' }, { type: 'office.read', teamId: '' }, { type: 'ui.next' }, { type: 'office.capabilities' },
    { type: 'offices.initialize', offices: [sparse] },
    { type: 'offices.initialize', offices: [], chat: { url: 'https://backend.example/chat' } },
    { type: 'offices.initialize', offices: [], chat: { url: '' } },
    { type: 'office.snapshot', teamId: 'schema-office', snapshot: officeSnapshotSchema.parse(sparse) },
    { type: 'decision.request', teamId: 'schema-office', decision: { id: 'menu', kind: 'confirmation', title: '是否继续？' } },
    { type: 'ui.respond', interactionId: 'inspect', presentation: { target: 'dialog', content: { template: 'detail-v1', title: '详情' } } },
    { type: 'ui.respond', interactionId: 'inspect', presentation: { target: 'whiteboard', snapshot: minimal() } },
  ]) {
    assert(officeMessageSchema.safeParse(request).success)
    assert(validate(request), JSON.stringify({ request, errors: validate.errors }))
  }
  for (const request of [
    { type: 'office.read', teamId: null },
    { type: 'offices.initialize', offices: [], chat: null },
    { type: 'offices.initialize', offices: [], chat: { url: null } },
    { type: 'offices.initialize', offices: [{ ...minimal(), workspace: { id: '', name: '无效' } }] },
    { type: 'offices.initialize', offices: [{ ...minimal(), employees: [{ id: '', name: '无效' }] }] },
    { type: 'offices.initialize', offices: [{ ...sparse, tasks: [{ ...sparse.tasks[0], id: '' }] }] },
    { type: 'offices.initialize', offices: [{ ...sparse, employees: [{ id: 'dev', name: '开发', sceneActorId: null }] }] },
  ]) {
    assert.equal(officeMessageSchema.safeParse(request).success, false)
    assert.equal(validate(request), false)
  }
})

test('published UI and scene inputs accept default omission while response schemas require normalized output', async t => {
  const data = await capabilities(t), ajv = validator()
  const presentation = ajv.compile(data.ui.presentationSchema), board = ajv.compile(data.ui.whiteboardSchema)
  assert(presentation({ target: 'dialog', content: { template: 'detail-v1', title: '详情' } }))
  assert(board({ title: '开发计划', steps: [{ id: 'develop', title: '开发' }] }))
  assert.equal(board({ title: null }), false)
  const say = ajv.compile(data.scene.capabilities.find(item => item.id === 'scene.say').params)
  assert(say({ text: '开始处理' }))
  const boardState = ajv.compile(data.scene.objects.find(item => item.id === 'whiteboard-1').stateSchema)
  assert(boardState({}))
  const error = ajv.compile(data.responses.error)
  assert(error(officeErrorResultSchema.parse({ reasonCode: 'INVALID_MESSAGE' })))
  assert.equal(error({ reasonCode: 'INVALID_MESSAGE' }), false, 'response defaults must still be present on the wire')
  const success = ajv.compile(data.responses.success)
  assert(success({ actions: [] }))
})
