import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'

let server
before(async () => { server = await createTestServer() })
after(() => server?.close())
const brokenView = () => { throw new Error('broken view') }

test('chat subscribers cannot strand a response in the thinking state', async t => {
  t.mock.method(console, 'warn', () => {})
  const { ChatSession } = await server.ssrLoadModule('/example/office-web/src/chat/ChatSession.ts')
  const session = new ChatSession('team-a', { kind: 'test', async *stream() { yield { type: 'delta', text: 'Answer' }; yield { type: 'done' } } })
  t.after(() => session.dispose())
  session.subscribe(brokenView)
  let notifications = 0
  session.subscribe(() => notifications++)
  await assert.doesNotReject(session.send('Question'))
  assert.equal(session.getSnapshot().phase, 'idle')
  assert.equal(session.getSnapshot().messages.at(-1).state, 'complete')
  assert.equal(session.getSnapshot().error, null)
  assert.equal(notifications, 3)
})

test('decision observers cannot interrupt queue advancement or receipt expiry', async t => {
  t.mock.method(console, 'warn', () => {})
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { DecisionSession } = await server.ssrLoadModule('/example/office-web/src/application/decisions/DecisionSession.ts')
  const session = new DecisionSession('team-a')
  session.subscribe(brokenView)
  const seen = []
  session.subscribe(() => seen.push(session.getSnapshot()))
  const request = { teamId: 'team-a', id: 'one', kind: 'confirmation', requester: { name: 'A', appearanceId: 'alpha' }, title: 'Approve', description: '', confirmLabel: 'Yes', rejectLabel: 'No' }
  assert.equal(session.enqueue(request), true)
  assert.equal(session.resolve('team-a', 'one', 'confirm').label, 'Yes')
  assert.doesNotThrow(() => t.mock.timers.tick(3001))
  assert.equal(session.getSnapshot().receipt, null)
  assert.equal(session.getSnapshot().records.length, 1)
  assert.equal(seen.length, 3)
})

test('example business updates remain successful when a view observer throws', async t => {
  t.mock.method(console, 'warn', () => {})
  const { ExampleOfficeDataSource } = await server.ssrLoadModule('/example/office-web/src/dashboard/demoSource.ts')
  const source = new ExampleOfficeDataSource()
  source.subscribe(brokenView)
  let notifications = 0
  source.subscribe(() => notifications++)
  await assert.doesNotReject(source.execute({ type: 'task.complete', taskId: 'market-research' }))
  assert.equal((await source.getSnapshot()).tasks.find(task => task.id === 'market-research').status, 'completed')
  assert.equal(notifications, 1)
})

test('demo observers cannot break start or prevent a rejected command from stopping the demo', async t => {
  t.mock.method(console, 'warn', () => {})
  const { OfficeDemoSource } = await server.ssrLoadModule('/example/office-web/src/dashboard/OfficeDemoSource.ts')
  const { createOfficeRuntime } = await server.ssrLoadModule('/example/office-web/src/application/createOfficeRuntime.ts')
  const runtime = createOfficeRuntime(); t.after(() => runtime.dispose())
  const source = new OfficeDemoSource(runtime), states = []
  source.subscribe(brokenView)
  source.subscribe(() => states.push(source.isRunning))
  assert.doesNotThrow(() => source.setEnabled(true))
  t.mock.method(runtime, 'submit', () => ({ status: 'rejected', error: { code: 'BUSY', message: 'Cannot start' } }))
  assert.doesNotThrow(() => source.tick(50))
  assert.equal(source.error, 'Cannot start')
  assert.deepEqual(states, [true, false])
})
