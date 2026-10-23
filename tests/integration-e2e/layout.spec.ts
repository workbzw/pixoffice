import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { createServer } from 'node:http'
import sharp from 'sharp'
import { createPixOfficeServer, defaultStaticRoot, DEMO_API_KEY } from '../../server/src/app.ts'
import { ExternalClient, office } from './client.ts'
import type { OfficeRead } from './client.ts'

let app: Awaited<ReturnType<typeof createPixOfficeServer>>, url: string, backend: ExternalClient
let errors: string[]
test.beforeEach(async ({ page }, testInfo) => {
  errors = []
  page.on('pageerror', error => errors.push(error.message))
  app = await createPixOfficeServer({ staticRoot: process.env.PIXOFFICE_E2E_STATIC_ROOT || defaultStaticRoot })
  url = await app.listen({ host: '127.0.0.1', port: 0 })
  const log = testInfo.outputPath('external-http.jsonl')
  await mkdir(path.dirname(log), { recursive: true })
  backend = new ExternalClient(url, DEMO_API_KEY, log)
})
test.afterEach(async () => { await app.close(); expect(errors).toEqual([]) })

test('remote layouts switch real pages and retain conversation data, drafts and member hover rules', async ({ page, context }, testInfo) => {
  const state = office()
  expect((await backend.post({ type: 'offices.initialize', offices: [state], layoutId: 'members' })).code).toBe(202)
  await page.goto(`${url}/office/?shell=classic`)
  await expect(page.locator('.member-workspace')).toBeVisible()
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('.member-profile-heading')).toContainText('验收开发员')
  await expect(page.locator('.agent-insight-access')).toHaveCount(0)
  await expect(page.locator('.member-current-task')).toContainText('登录模块验收')
  const stats = await sharp(await page.locator('canvas').screenshot()).stats()
  expect(stats.channels[0].stdev).toBeGreaterThan(10)
  await page.getByRole('button', { name: '展开对话', exact: true }).click()
  const input = page.getByRole('textbox', { name: '给办公室发送消息' })
  await input.fill('切换布局保留这条草稿')
  expect((await backend.post({ type: 'office.layout.set', layoutId: 'classic' })).code).toBe(200)
  await expect(page.locator('.runtime-workspace')).toBeVisible()
  await expect(input).toHaveValue('切换布局保留这条草稿')
  await page.getByRole('button', { name: '收起聊天', exact: true }).click()
  await page.getByRole('button', { name: '切换页面布局', exact: true }).click()
  await page.getByRole('button', { name: '成员布局', exact: true }).click()
  await expect(page.locator('.member-workspace')).toBeVisible()
  const choice = await backend.post<{ currentLayoutId: string }>({ type: 'office.layout.read' })
  expect(choice.data.currentLayoutId).toBe('members')
  state.seq = 2; state.conversations[0].tasks[0].status = 'completed'
  expect((await backend.post({ type: 'office.snapshot', teamId: state.workspace.id, snapshot: state })).code).toBe(200)
  await expect(page.locator('.member-current-task')).toContainText('已完成')
  await page.reload()
  await expect(page.locator('.member-workspace')).toBeVisible()
  await expect(page.locator('.member-current-task')).toContainText('已完成')
  await page.getByRole('button', { name: '展开对话', exact: true }).click()
  await expect(input).toHaveValue('切换布局保留这条草稿')
  await page.getByRole('button', { name: '收起聊天', exact: true }).click()
  const late = await context.newPage()
  await late.goto(`${url}/office/`)
  await expect(late.locator('.member-workspace')).toBeVisible()
  await expect(late.locator('.member-current-task')).toContainText('已完成')
  expect((await backend.post({ type: 'office.layout.set', layoutId: 'classic' })).code).toBe(200)
  await expect(page.locator('.runtime-workspace')).toBeVisible()
  await expect(late.locator('.runtime-workspace')).toBeVisible()
  await testInfo.attach('remote-layout', { body: await page.screenshot(), contentType: 'image/png' })
  expect((await backend.read(state.workspace.id)).data.snapshot.seq).toBe(2)
})

test('layout selection also synchronizes empty pages before offices exist', async ({ page }) => {
  expect((await backend.post({ type: 'office.layout.set', layoutId: 'members' })).code).toBe(202)
  await page.goto(`${url}/office/`)
  await expect(page.locator('.member-workspace')).toBeVisible()
  await expect(page.getByText('等待后端初始化办公室', { exact: true })).toBeVisible()
  expect((await backend.post({ type: 'office.layout.set', layoutId: 'classic' })).code).toBe(200)
  await expect(page.locator('.runtime-workspace')).toBeVisible()
  const result = await backend.post({ type: 'office.read', teamId: 'team-a' })
  expect(result.code).toBe(404)
})

test('initialization exposes complete discovery and live state and the discovered decision contract works', async ({ page }, testInfo) => {
  await page.goto(`${url}/office/`)
  await expect(page.getByText('等待后端初始化办公室', { exact: true })).toBeVisible()
  type Workspace = { capabilities: { supportedMessages: string[]; chat: { operations: { type: string }[] } };
    state: { layout: { currentLayoutId: string }; offices: OfficeRead[] } }
  const state = office(), other = structuredClone(state.conversations[0])
  other.id = 'review'; other.title = '独立复盘会话'; other.whiteboard.title = '第二个目标'; state.conversations.push(other)
  const initialized = await backend.post<Workspace>({ type: 'offices.initialize', offices: [state], layoutId: 'members' })
  expect(initialized.code).toBe(200)
  expect(initialized.data.state.layout.currentLayoutId).toBe('members')
  const view = initialized.data.state.offices[0]
  expect(view.snapshot.conversations).toHaveLength(2)
  expect(view.snapshot.conversations[1].whiteboard.title).toBe('第二个目标')
  expect(view.runtime.available).toBe(true)
  expect(view.runtime.selectedConversationId).toBe('main')
  expect(view.runtime.actors).toHaveLength(6)
  expect(view.runtime.objects.length).toBeGreaterThan(6)
  expect(initialized.data.capabilities.chat.operations.map(item => item.type)).toEqual(['send', 'history', 'resume', 'cancel'])
  expect((await backend.post({ type: 'office.capabilities' })).data).toEqual(initialized.data.capabilities)
  await expect(page.locator('.member-workspace')).toBeVisible()
  await expect(page.locator('.member-current-task')).toContainText('登录模块验收')
  expect(initialized.data.capabilities.supportedMessages).toContain('decision.request')
  const pending = backend.post<{ choiceId: string }>({ type: 'decision.request', teamId: 'team-a', conversationId: 'main', timeoutMs: 15000,
    decision: { id: 'discovery-approval', kind: 'confirmation', title: '完整契约验收', confirmLabel: '确认验收', rejectLabel: '暂不确认' } })
  const panel = page.getByRole('complementary', { name: '待你决定' })
  await expect(panel.getByRole('heading', { name: '完整契约验收' })).toBeVisible()
  expect((await backend.read('team-a')).data.runtime.pendingDecisions).toContain('discovery-approval')
  await testInfo.attach('complete-discovery', { body: await page.screenshot(), contentType: 'image/png' })
  await panel.getByRole('button', { name: '确认验收', exact: true }).click()
  expect((await pending).data.choiceId).toBe('confirm')
  expect((await backend.read('team-a')).data.runtime.pendingDecisions).toEqual([])
})

test('chat update notifications refresh real transcripts and preserve per-conversation drafts', async ({ page, context }) => {
  const replies = new Map([['main', '初始聊天内容'], ['review', '另一会话的汇报']]), reads: string[] = []
  const upstream = createServer(async (request, response) => {
    let body = ''
    for await (const chunk of request) body += chunk
    const operation = JSON.parse(body) as { type: string; conversationId: string }
    response.writeHead(200, { 'Content-Type': 'application/json' })
    reads.push(operation.conversationId)
    response.end(JSON.stringify({ code: 200, msg: 'OK', data: { turns: [{ id: 'turn', user: '查看当前进展', assistant: replies.get(operation.conversationId) ?? '', state: 'complete', error: '' }], nextCursor: '', hasMore: false, activeTurnId: '' } }))
  })
  await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve))
  const address = upstream.address()
  if (!address || typeof address === 'string') throw new Error('Chat service failed to listen')
  try {
    const state = office(), review = structuredClone(state.conversations[0]); review.id = 'review'; review.title = '复盘会话'; state.conversations.push(review)
    expect((await backend.post({ type: 'offices.initialize', offices: [state], layoutId: 'members', chat: { url: `http://127.0.0.1:${address.port}/chat` } })).code).toBe(202)
    await page.goto(`${url}/office/`)
    await expect(page.locator('.member-workspace')).toBeVisible()
    await page.getByRole('button', { name: '展开对话', exact: true }).click()
    const transcript = page.getByRole('log', { name: '对话内容' }), input = page.getByRole('textbox', { name: '给办公室发送消息' })
    await expect(transcript).toContainText('初始聊天内容')
    await input.fill('主会话的未发送草稿')
    replies.set('main', '## 新的上架汇报\n商品已经完成复核。')
    expect((await backend.post({ type: 'chat.updated', teamId: 'team-a', conversationId: 'main' })).code).toBe(200)
    await expect(transcript.getByRole('heading', { name: '新的上架汇报' })).toBeVisible()
    await expect(input).toHaveValue('主会话的未发送草稿')
    const otherReads = reads.filter(id => id === 'review').length
    expect((await backend.post({ type: 'chat.updated', teamId: 'team-a', conversationId: 'review' })).code).toBe(200)
    expect(reads.filter(id => id === 'review')).toHaveLength(otherReads)
    await page.getByRole('tab', { name: '复盘会话', exact: true }).click()
    await expect(transcript).toContainText('另一会话的汇报')
    await input.fill('复盘会话的草稿')
    await context.setOffline(true)
    replies.set('review', '断线期间保存的最新汇报')
    await backend.post({ type: 'chat.updated', teamId: 'team-a', conversationId: 'review' })
    await context.setOffline(false)
    await expect(transcript).toContainText('断线期间保存的最新汇报', { timeout: 30000 })
    await expect(input).toHaveValue('复盘会话的草稿')
    await page.getByRole('tab', { name: '主会话', exact: true }).click()
    await expect(input).toHaveValue('主会话的未发送草稿')
  } finally {
    await context.setOffline(false)
    upstream.closeAllConnections()
    await new Promise<void>(resolve => upstream.close(() => resolve()))
  }
})

test('discovered furniture interactions can be submitted without hard-coded interaction or actor IDs', async ({ page }) => {
  type Furniture = { id: string; interactions: { id: string; requiresHome: boolean; actorIds: string[] }[] }
  const state = office()
  await backend.post({ type: 'offices.initialize', offices: [state] })
  await page.goto(`${url}/office/`)
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30000 })
  const discovered = await backend.post<{ scene: { objects: Furniture[] } }>({ type: 'office.capabilities' })
  const desk = discovered.data.scene.objects.find(item => item.interactions.some(interaction => interaction.requiresHome))!
  const interaction = desk.interactions.find(item => item.requiresHome)!
  const before = await backend.read('team-a')
  expect(before.data.runtime.available).toBe(true)
  expect(before.data.runtime.objects.find(item => (item as Furniture).id === desk.id)).toMatchObject({ interactions: desk.interactions })
  const commandId = 'discovered-furniture-use'
  expect((await backend.post({ teamId: 'team-a', command: { protocolVersion: '2.0', sceneId: 'team-a', commandId, type: 'activity.start', capability: 'furniture.use',
    participants: [{ entityId: interaction.actorIds[0], role: 'user' }], params: { objectId: desk.id, interactionId: interaction.id, durationMs: 30000 } } })).code).toBe(200)
  await page.getByRole('button', { name: '场景控制', exact: true }).click()
  await expect(page.getByRole('button', { name: /结束.*入座工作/ })).toBeVisible()
})
