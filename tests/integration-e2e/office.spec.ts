import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { test, expect, openOffice, selectOffice } from './fixtures.ts'
import { office } from './client.ts'
import type { Capabilities } from './client.ts'
import type { Page } from '@playwright/test'

async function showBoard(page: Page) {
  const canvas = page.locator('canvas'), bounds = await canvas.boundingBox()
  expect(bounds).not.toBeNull()
  const scale = Math.min(bounds!.width / 1100, bounds!.height / 850)
  await canvas.click({ position: { x: bounds!.width / 2, y: (bounds!.height - 850 * scale) / 2 + 125 * scale } })
  await expect(page.getByRole('dialog', { name: '协作白板' })).toBeVisible()
  return page.getByRole('dialog', { name: '协作白板' })
}

async function canvasDensity(page: Page) {
  const density = await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const bounds = canvas.getBoundingClientRect()
    return { devicePixelRatio: window.devicePixelRatio, width: canvas.width, height: canvas.height, cssWidth: bounds.width, cssHeight: bounds.height }
  })
  expect(density.devicePixelRatio).toBe(2)
  expect(Math.abs(density.width - density.cssWidth * 2)).toBeLessThanOrEqual(2)
  expect(Math.abs(density.height - density.cssHeight * 2)).toBeLessThanOrEqual(2)
  return density
}

test('conversation tabs isolate pushed tasks, wall boards and drafts, including background updates and reload', async ({ backend, page, service }, testInfo) => {
  const state = office()
  state.conversations[0].title = '登录开发'
  const second = structuredClone(state.conversations[0]); second.id = 'review'; second.title = '需求评审'
  second.tasks[0].title = '确认需求范围'; second.whiteboard.title = '需求评审目标'
  state.conversations.push(second)
  expect((await backend.post({ type: 'offices.initialize', offices: [state] })).code).toBe(202)
  await openOffice(page, service.url)
  await page.getByRole('button', { name: '展开对话', exact: true }).click()
  await expect(page.locator('.office-chat-header')).toHaveCount(0)
  await page.getByRole('tab', { name: '需求评审', exact: true }).click()
  await expect(page.getByRole('complementary', { name: '会话概览' })).toHaveCount(0)
  await expect(page.locator('.runtime-task-list')).toContainText('确认需求范围')
  await page.getByRole('textbox', { name: '给办公室发送消息' }).fill('评审会话的未发送草稿')
  state.seq = 2; state.conversations[0].tasks[0].title = '登录已完成'; state.conversations[0].tasks[0].status = 'completed'
  state.conversations[0].whiteboard.title = '登录交付'; state.conversations[0].whiteboard.status = 'completed'
  expect((await backend.post({ type: 'office.snapshot', teamId: 'team-a', snapshot: state })).code).toBe(200)
  await expect(page.getByRole('tab', { name: '需求评审', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.runtime-task-list')).not.toContainText('登录已完成')
  await page.getByRole('button', { name: '收起聊天', exact: true }).click()
  await expect(await showBoard(page)).toContainText('需求评审目标')
  await page.getByRole('button', { name: '关闭白板', exact: true }).click()
  await page.getByRole('button', { name: '展开对话', exact: true }).click()
  await page.getByRole('tab', { name: '登录开发', exact: true }).click()
  await expect(page.locator('.runtime-task-list')).toContainText('登录已完成')
  await expect(page.getByRole('textbox', { name: '给办公室发送消息' })).toHaveValue('')
  await page.getByRole('tab', { name: '需求评审', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '给办公室发送消息' })).toHaveValue('评审会话的未发送草稿')
  await testInfo.attach('conversation-workspace', { body: await page.screenshot(), contentType: 'image/png' })
  await page.waitForTimeout(700)
  await page.reload()
  await page.getByRole('button', { name: '展开对话', exact: true }).click()
  await expect(page.getByRole('tab', { name: '需求评审', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('textbox', { name: '给办公室发送消息' })).toHaveValue('评审会话的未发送草稿')
})

test('initializes two offices and keeps task and whiteboard data separate', async ({ backend, page, service }, testInfo) => {
  const a = office(), b = office('team-b')
  b.conversations[0].tasks[0].title = '产品调研验收'; b.conversations[0].whiteboard.title = '产品调研计划'
  const initialized = await backend.post({ type: 'offices.initialize', offices: [a, b] })
  expect(initialized.code).toBe(202)
  await openOffice(page, service.url)
  await expect(page.locator('.runtime-task-list')).toContainText(a.conversations[0].tasks[0].title)
  const board = await showBoard(page)
  await expect(board).toContainText(a.conversations[0].whiteboard.title)
  await page.getByRole('button', { name: '关闭白板', exact: true }).click()
  await selectOffice(page, b.workspace.name)
  await expect(page.locator('.runtime-task-list')).toContainText(b.conversations[0].tasks[0].title)
  await expect(page.locator('.runtime-task-list')).not.toContainText(a.conversations[0].tasks[0].title)
  await selectOffice(page, a.workspace.name)
  const stats = await sharp(await page.locator('canvas').screenshot()).stats()
  expect(stats.channels[0].stdev).toBeGreaterThan(10)
  await testInfo.attach('canvas-density', { body: JSON.stringify(await canvasDensity(page)), contentType: 'application/json' })
  await testInfo.attach('initialized-office', { body: await page.screenshot(), contentType: 'image/png' })
})

test('updates running work to completed and restores it after refresh', async ({ backend, page, service }) => {
  const state = office()
  expect((await backend.post({ type: 'offices.initialize', offices: [state] })).code).toBe(202)
  await openOffice(page, service.url)
  await page.getByRole('button', { name: /登录模块验收.*进行中/ }).click()
  await expect(page.locator('.runtime-task-detail')).toContainText(state.conversations[0].tasks[0].summary!)
  state.seq = 2; state.conversations[0].tasks[0].status = 'completed'; state.conversations[0].tasks[0].progress = 100
  state.conversations[0].whiteboard.status = 'completed'; state.conversations[0].whiteboard.steps[0].progress = 100
  const response = await backend.post<{ status: string }>({ type: 'office.snapshot', teamId: 'team-a', snapshot: state })
  expect(response.code).toBe(200); expect(response.data.status).toBe('applied')
  await page.getByRole('button', { name: /^任务中心/ }).click()
  await expect(page.locator('.runtime-task-list')).toContainText('已完成')
  await expect(page.locator('.runtime-task-progress')).toHaveText('100%')
  await page.reload(); await openOffice(page, service.url)
  await page.getByRole('button', { name: /^任务中心/ }).click()
  await expect(page.locator('.runtime-task-progress')).toHaveText('100%')
  const board = await showBoard(page)
  await expect(board).toContainText('100%')
  expect((await backend.read('team-a')).data.snapshot.seq).toBe(2)
})

test('whiteboard progress advances below 100 until the backend sends completed status', async ({ backend, page, service }) => {
  const state = office()
  state.conversations[0].whiteboard.steps[0].progress = 0
  await backend.post({ type: 'offices.initialize', offices: [state] }); await openOffice(page, service.url)
  const reader = await showBoard(page), bar = reader.getByRole('progressbar', { name: state.conversations[0].whiteboard.steps[0].title, exact: true })
  const first = Number(await bar.getAttribute('aria-valuenow'))
  await expect.poll(async () => Number(await bar.getAttribute('aria-valuenow'))).toBeGreaterThan(first + 2)
  expect((await backend.read('team-a')).data.snapshot.conversations[0].whiteboard.steps[0].progress).toBe(0)
  state.seq = 2; state.conversations[0].whiteboard.steps[0].progress = 100
  expect((await backend.post({ type: 'office.snapshot', teamId: 'team-a', snapshot: state })).code).toBe(200)
  await expect(bar).toHaveAttribute('aria-valuenow', '99')
  await expect(reader).toContainText('执行中')
  state.seq = 3; state.conversations[0].whiteboard.status = 'completed'; state.conversations[0].whiteboard.steps[0].progress = 25
  expect((await backend.post({ type: 'office.snapshot', teamId: 'team-a', snapshot: state })).code).toBe(200)
  await expect(bar).toHaveAttribute('aria-valuenow', '100')
  await expect(reader).toContainText('已完成')
  expect((await backend.read('team-a')).data.snapshot.conversations[0].whiteboard.steps[0].progress).toBe(25)
  await page.getByRole('button', { name: '关闭白板', exact: true }).click()
  await expect((await showBoard(page)).getByRole('progressbar', { name: state.conversations[0].whiteboard.steps[0].title, exact: true })).toHaveAttribute('aria-valuenow', '100')
  state.seq = 4; state.conversations[0].whiteboard.title = '下一个开发任务'; state.conversations[0].whiteboard.status = 'running'; state.conversations[0].whiteboard.steps[0].progress = 0
  await backend.post({ type: 'office.snapshot', teamId: 'team-a', snapshot: state })
  await expect(reader).toContainText('下一个开发任务')
  expect(Number(await bar.getAttribute('aria-valuenow'))).toBeLessThan(99)
})

test('a person click reaches the backend and dialog options return another user action', async ({ backend, page, service }) => {
  await backend.post({ type: 'offices.initialize', offices: [office()] })
  await openOffice(page, service.url)
  await expect(page.getByRole('button', { name: '编辑布局', exact: true })).toBeEnabled()
  const waiting = backend.next(), canvas = page.locator('canvas'), bounds = await canvas.boundingBox()
  const scale = Math.min(bounds!.width / 1100, bounds!.height / 850)
  const person = { x: (bounds!.width - 1100 * scale) / 2 + 350 * scale, y: (bounds!.height - 850 * scale) / 2 + 310 * scale }
  await canvas.hover({ position: person })
  const statistics = page.getByRole('dialog', { name: '验收开发员的成员统计', exact: true })
  await expect(statistics).toBeVisible()
  await statistics.getByRole('button', { name: '关闭成员统计', exact: true }).click()
  await canvas.click({ position: person })
  const action = (await waiting).data.actions[0]
  expect(action).toMatchObject({ conversationId: 'main', teamId: 'team-a', action: 'actor.inspect', actorId: 'office-lead' })
  expect((await backend.respond(action.id, { target: 'dialog', content: { template: 'detail-v1', title: '开发员实时详情', description: '后端返回的详情。',
    fields: [{ label: '任务', value: '登录模块验收' }], actions: [{ id: 'review', label: '提交验收' }] } })).code).toBe(200)
  const dialog = page.getByRole('dialog', { name: '开发员实时详情' })
  await expect(dialog).toContainText('后端返回的详情。')
  const next = backend.next()
  await dialog.getByRole('button', { name: '提交验收', exact: true }).click()
  const option = (await next).data.actions[0]
  expect(option).toMatchObject({ conversationId: 'main', action: 'dialog.action', interactionId: action.id, optionId: 'review', teamId: 'team-a' })
  await backend.respond(option.id, { target: 'dialog', content: { template: 'detail-v1', title: '验收已提交' } })
  await expect(page.getByRole('dialog', { name: '验收已提交' })).toBeVisible()
})

test('task buttons request backend processing and the backend can display the result on the whiteboard', async ({ backend, page, service }) => {
  const state = office()
  await backend.post({ type: 'offices.initialize', offices: [state] })
  await openOffice(page, service.url)
  await page.getByRole('button', { name: /登录模块验收.*进行中/ }).click()
  const waiting = backend.next()
  await page.getByRole('button', { name: '完成任务', exact: true }).click()
  const action = (await waiting).data.actions[0]
  expect(action).toMatchObject({ conversationId: 'main', action: 'task.complete', taskId: 'login', teamId: 'team-a' })
  state.seq = 2; state.conversations[0].tasks[0].status = 'completed'; state.conversations[0].tasks[0].progress = 100
  state.conversations[0].whiteboard.title = '后端确认任务完成'; state.conversations[0].whiteboard.status = 'completed'; state.conversations[0].whiteboard.steps[0].progress = 100
  expect((await backend.respond(action.id, { target: 'whiteboard', snapshot: state })).code).toBe(200)
  await expect(page.getByText('等待后端处理…', { exact: true })).toBeHidden()
  await expect(await showBoard(page)).toContainText('后端确认任务完成')
})

for (const choice of ['confirm', 'reject']) test(`confirmation menu returns ${choice} through its original request`, async ({ backend, page, service }) => {
  await backend.post({ type: 'offices.initialize', offices: [office()] })
  await openOffice(page, service.url)
  const pending = backend.post<{ choiceId: string; decisionId: string }>({ conversationId: 'main', type: 'decision.request', teamId: 'team-a', timeoutMs: 10000,
    decision: { id: 'approval', kind: 'confirmation', title: '是否提交验收？', confirmLabel: '确认提交', rejectLabel: '拒绝提交' } })
  const panel = page.getByRole('complementary', { name: '待你决定' })
  await expect(panel.getByRole('heading', { name: '是否提交验收？' })).toBeVisible()
  await panel.getByRole('button', { name: choice === 'confirm' ? '确认提交' : '拒绝提交', exact: true }).click()
  const response = await pending
  expect(response.code).toBe(200); expect(response.data).toMatchObject({ choiceId: choice, decisionId: 'approval' })
  await expect(panel.getByRole('heading', { name: '是否提交验收？' })).toBeHidden()
})

test('choice menus show a shrinking bottom countdown and return the selected option', async ({ backend, page, service }, testInfo) => {
  await backend.post({ type: 'offices.initialize', offices: [office()] }); await openOffice(page, service.url)
  const pending = backend.post<{ choiceId: string }>({ conversationId: 'main', type: 'decision.request', teamId: 'team-a', timeoutMs: 15000,
    decision: { id: 'choice', kind: 'choice', title: '选择验收范围', options: [{ id: 'full', label: '完整验收' }, { id: 'smoke', label: '快速验收' }] } })
  const panel = page.getByRole('complementary', { name: '待你决定' })
  await expect(panel.getByRole('button', { name: '提交选择' })).toBeDisabled()
  const progress = panel.getByRole('progressbar', { name: '选择剩余时间' }), fill = progress.locator('i')
  await expect(progress).toBeVisible()
  await expect(fill).toHaveCSS('background-color', 'rgb(42, 186, 131)')
  const actions = await panel.locator('.office-decision-actions').boundingBox(), track = await progress.boundingBox()
  expect(track!.y).toBeGreaterThan(actions!.y + actions!.height)
  expect(track!.height).toBe(6)
  const initial = Number(await progress.getAttribute('aria-valuenow')), initialWidth = (await fill.boundingBox())!.width
  await expect.poll(async () => Number(await progress.getAttribute('aria-valuenow')), { timeout: 6000, intervals: [250] }).toBeLessThanOrEqual(initial - 20)
  expect((await fill.boundingBox())!.width).toBeLessThan(initialWidth * .9)
  await testInfo.attach('choice-countdown', { body: await page.screenshot(), contentType: 'image/png' })
  await panel.getByRole('radio', { name: '完整验收' }).check()
  await panel.getByRole('button', { name: '提交选择' }).click()
  expect((await pending).data.choiceId).toBe('full')
})

test('an expired menu closes without creating a default approval', async ({ backend, page, service }) => {
  await backend.post({ type: 'offices.initialize', offices: [office()] }); await openOffice(page, service.url)
  const pending = backend.post<{ reasonCode: string }>({ conversationId: 'main', type: 'decision.request', teamId: 'team-a', timeoutMs: 5000,
    decision: { id: 'timeout', kind: 'confirmation', title: '即将过期的验收' } })
  const title = page.getByRole('heading', { name: '即将过期的验收' })
  await expect(title).toBeVisible()
  const progress = page.getByRole('progressbar', { name: '选择剩余时间' })
  await expect(progress).toBeVisible()
  const initial = Number(await progress.getAttribute('aria-valuenow'))
  await expect.poll(async () => Number(await progress.getAttribute('aria-valuenow')), { timeout: 3000, intervals: [250] }).toBeLessThan(initial - 10)
  expect((await pending).code).toBe(408)
  await expect(title).toBeHidden()
  expect((await backend.read('team-a')).data.runtime.pendingDecisions).toEqual([])
})

for (const mobile of [false, true]) test(`background-office decisions submit without switching (${mobile ? 'mobile' : 'desktop'})`, async ({ backend, page, service }) => {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 })
  const a = office(), b = office('team-b')
  await backend.post({ type: 'offices.initialize', offices: [a, b] }); await openOffice(page, service.url)
  const card = page.getByRole('region', { name: `${b.workspace.name}待决定提示` })
  for (const choice of ['confirm', 'reject']) {
    const pending = backend.post<{ teamId: string; choiceId: string }>({ conversationId: 'main', type: 'decision.request', teamId: 'team-b', timeoutMs: 15000,
      decision: { id: `background-${choice}`, kind: 'confirmation', title: '产品团队的确认', confirmLabel: '确认提交', rejectLabel: '暂不提交' } })
    await expect(card.getByRole('heading', { name: '产品团队的确认' })).toBeVisible()
    await card.getByRole('button', { name: choice === 'confirm' ? '确认提交' : '暂不提交', exact: true }).click()
    expect((await pending).data).toMatchObject({ teamId: 'team-b', choiceId: choice })
    await expect(page.getByRole('button', { name: new RegExp(`^团队空间，当前团队：${a.workspace.name}`) })).toBeVisible()
  }
  const pending = backend.post<{ teamId: string; choiceId: string }>({ conversationId: 'main', type: 'decision.request', teamId: 'team-b', timeoutMs: 15000,
    decision: { id: 'background-choice', kind: 'choice', title: '选择验收方式', options: [{ id: 'full', label: '完整验收' }, { id: 'smoke', label: '快速验收' }] } })
  await expect(card.getByRole('button', { name: '先选择一项', exact: true })).toBeDisabled()
  await card.getByRole('radio', { name: '快速验收', exact: true }).check()
  await card.getByRole('button', { name: '提交选择', exact: true }).click()
  expect((await pending).data).toMatchObject({ teamId: 'team-b', choiceId: 'smoke' })
  await expect(card).toBeHidden()
  expect((await backend.read('team-a')).data.runtime.pendingDecisions).toEqual([])
  await expect(page.getByRole('button', { name: new RegExp(`^团队空间，当前团队：${a.workspace.name}`) })).toBeVisible()
})

test('real animation changes both the visible canvas and public actor state', async ({ backend, page, service }, testInfo) => {
  const state = office(); state.conversations[0].tasks = []
  await backend.post({ type: 'offices.initialize', offices: [state] }); await openOffice(page, service.url)
  const discovered = await backend.post<Capabilities>({ type: 'office.capabilities' })
  expect(discovered.data.scene.capabilities.some(capability => capability.id === 'office.visit')).toBe(true)
  const actors = discovered.data.scene.actors, visitor = actors[0], host = actors[1]
  const previous = (await backend.read('team-a')).data.runtime.actors.find(actor => actor.id === visitor.id)!.position
  const canvas = page.locator('canvas'), before = await canvas.screenshot()
  expect((await backend.command('team-a', 'office.visit', [{ entityId: visitor.id, role: 'visitor' }, { entityId: host.id, role: 'host' }],
    { stops: [{ hostId: host.id, message: '请验收本次交付。' }], durationMs: 3000 })).code).toBe(200)
  await expect.poll(async () => (await backend.read('team-a')).data.runtime.actors.find(actor => actor.id === visitor.id)!.position,
    { timeout: 15000 }).not.toEqual(previous)
  const after = await canvas.screenshot()
  const difference = await sharp(after).composite([{ input: before, blend: 'difference' }]).stats()
  expect(difference.channels.slice(0, 3).reduce((sum, channel) => sum + channel.mean, 0)).toBeGreaterThan(.05)
  await testInfo.attach('animation-before', { body: before, contentType: 'image/png' })
  await testInfo.attach('animation-after', { body: after, contentType: 'image/png' })
})

test('offline updates recover after reconnection, refresh and a new browser page', async ({ backend, page, context, service }) => {
  const state = office()
  await backend.post({ type: 'offices.initialize', offices: [state] }); await openOffice(page, service.url)
  await context.setOffline(true)
  state.seq = 2; state.conversations[0].tasks[0].title = '离线期间更新的任务'
  const updated = await backend.post({ type: 'office.snapshot', teamId: 'team-a', snapshot: state })
  expect([200, 202, 408]).toContain(updated.code)
  await context.setOffline(false)
  await expect(page.locator('.runtime-task-list')).toContainText(state.conversations[0].tasks[0].title, { timeout: 20000 })
  await page.reload(); await openOffice(page, service.url)
  await expect(page.locator('.runtime-task-list')).toContainText(state.conversations[0].tasks[0].title)
  const another = await context.newPage(); await openOffice(another, service.url)
  await expect(another.locator('.runtime-task-list')).toContainText(state.conversations[0].tasks[0].title)
  expect((await backend.read('team-a')).data.snapshot.seq).toBe(2)
})

test('server restart clears the stale directory and accepts fresh initialization', async ({ backend, page, service }) => {
  const state = office(); state.seq = 5
  await backend.post({ type: 'offices.initialize', offices: [state] }); await openOffice(page, service.url)
  await service.restart()
  await expect(page.getByText('等待后端初始化办公室', { exact: true })).toBeVisible({ timeout: 20000 })
  expect((await backend.post<{ state: { offices: object[] } }>({ type: 'office.read' })).data.state.offices).toEqual([])
  expect((await backend.read('team-a')).code).toBe(404)
  const fresh = office(); fresh.conversations[0].tasks[0].title = '重启后的新任务'
  expect((await backend.post({ type: 'offices.initialize', offices: [fresh] })).code).toBe(200)
  await expect(page.locator('.runtime-task-list')).toContainText(fresh.conversations[0].tasks[0].title)
  expect((await backend.read('team-a')).data.snapshot.seq).toBe(1)
})

test('duplicate, conflicting, invalid and concurrent out-of-order updates preserve latest state in two pages', async ({ backend, page, context, service }) => {
  const state = office()
  await backend.post({ type: 'offices.initialize', offices: [state] }); await openOffice(page, service.url)
  const second = await context.newPage(); await openOffice(second, service.url)
  expect((await backend.post({ type: 'office.snapshot', teamId: 'team-a', snapshot: state })).code).toBe(200)
  const conflict = structuredClone(state); conflict.conversations[0].tasks[0].title = '相同版本冲突'
  expect((await backend.post({ type: 'office.snapshot', teamId: 'team-a', snapshot: conflict })).code).toBe(409)
  expect((await backend.post({ type: 'office.read' }, { key: 'incorrect' })).code).toBe(401)
  expect((await backend.post({ type: 'office.snapshot', teamId: 'team-a', snapshot: { ...state, whiteboard: null } })).code).toBe(400)
  expect((await backend.post({ type: 'office.unknown' })).code).toBe(400)
  const requests = [9, 3, 12, 2, 5, 8, 11, 4, 7, 10, 6].map(seq => {
    const next = structuredClone(state); next.seq = seq; next.conversations[0].tasks[0].title = `并发任务 ${seq}`
    return backend.post({ type: 'office.snapshot', teamId: 'team-a', snapshot: next })
  })
  expect((await Promise.all(requests)).every(response => response.code === 200 || response.code === 202)).toBe(true)
  for (const current of [page, second]) {
    await expect(current.locator('.runtime-task-list')).toContainText('并发任务 12')
    await expect(current.locator('.runtime-alert')).toHaveCount(0)
  }
  expect((await backend.read('team-a')).data.snapshot.seq).toBe(12)
})

test('mobile page renders a nonblank scene and allows menu selection', async ({ backend, page, service }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await backend.post({ type: 'offices.initialize', offices: [office()] }); await openOffice(page, service.url)
  const stats = await sharp(await page.locator('canvas').screenshot()).stats()
  expect(stats.channels[0].stdev).toBeGreaterThan(10)
  await canvasDensity(page)
  const pending = backend.post<{ choiceId: string }>({ conversationId: 'main', type: 'decision.request', teamId: 'team-a', timeoutMs: 15000,
    decision: { id: randomUUID(), kind: 'confirmation', title: '移动端确认', confirmLabel: '确认验收', rejectLabel: '返回检查' } })
  await page.getByRole('button', { name: '确认验收', exact: true }).click()
  expect((await pending).data.choiceId).toBe('confirm')
  await testInfo.attach('mobile-office', { body: await page.screenshot(), contentType: 'image/png' })
})

test.describe('static local demo', () => {
  test.use({ staticDemo: true })
  test.setTimeout(120000)

  async function advanceDemo(page: Page, milliseconds: number) {
    for (let remaining = milliseconds; remaining > 0;) {
      const step = Math.min(1000, remaining)
      await page.clock.fastForward(step); remaining -= step
    }
  }
  async function waitForListing(page: Page) {
    const confirmation = page.getByRole('button', { name: '确认上架', exact: true })
    for (let elapsed = 0; elapsed < 60000 && !await confirmation.isVisible(); elapsed += 1000) await advanceDemo(page, 1000)
    await expect(confirmation).toBeVisible()
  }
  async function finishOptimization(page: Page) {
    const start = page.getByRole('button', { name: '开始演示', exact: true })
    for (let elapsed = 0; elapsed < 60000 && !await start.isVisible(); elapsed += 1000) await advanceDemo(page, 1000)
    await expect(start).toBeVisible()
  }

  test('members layout disables character statistics popovers without changing selection or classic hover', async ({ page, service }, testInfo) => {
    await page.goto(`${service.url}/office/?shell=classic`)
    await expect(page.getByRole('button', { name: '编辑布局', exact: true })).toBeEnabled({ timeout: 30000 })
    const hoverPerson = async () => {
      const canvas = page.locator('canvas'), bounds = (await canvas.boundingBox())!
      const scale = Math.min(bounds.width / 1100, bounds.height / 850)
      const position = { x: (bounds.width - 1100 * scale) / 2 + 350 * scale, y: (bounds.height - 850 * scale) / 2 + 310 * scale }
      await page.mouse.move(bounds.x + position.x, bounds.y + position.y)
      return { canvas, position }
    }
    await hoverPerson()
    const statistics = page.getByRole('dialog', { name: '王明的成员统计', exact: true })
    await expect(statistics).toBeVisible()
    await statistics.getByRole('button', { name: '固定统计窗口', exact: true }).click()
    await page.getByRole('button', { name: '切换页面布局', exact: true }).click()
    await page.getByRole('button', { name: '成员布局', exact: true }).click()
    await expect(page.locator('.member-workspace')).toBeVisible()
    await expect(page.locator('.agent-insight-popover')).toHaveCount(0)
    await expect(page.locator('.agent-insight-access')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '编辑布局', exact: true })).toBeEnabled()
    await page.mouse.move(4, 4)
    const person = await hoverPerson()
    await expect(page.locator('.agent-insight-popover')).toHaveCount(0)
    await page.getByRole('button', { name: '查看李研的资料', exact: true }).click()
    await expect(page.getByRole('button', { name: '查看李研的资料', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.member-profile-heading')).toContainText('李研')
    await person.canvas.click({ position: person.position })
    await expect(page.getByRole('button', { name: '查看王明的资料', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.agent-insight-popover')).toHaveCount(0)
    await testInfo.attach('members-without-hover-popover', { body: await page.screenshot(), contentType: 'image/png' })
    await page.getByRole('button', { name: '切换页面布局', exact: true }).click()
    await page.getByRole('button', { name: '经典布局', exact: true }).click()
    await expect(page.locator('.runtime-workspace')).toBeVisible()
    await expect(page.locator('.agent-insight-popover')).toHaveCount(0)
    await page.mouse.move(4, 4)
    await hoverPerson()
    await expect(statistics).toBeVisible()
  })

  test('every member shows retained personal activity in the sidebar and archive', async ({ page, service }, testInfo) => {
    await page.clock.install()
    await page.goto(`${service.url}/office/?shell=members`)
    const start = page.getByRole('button', { name: '开始演示', exact: true })
    await expect(start).toBeEnabled({ timeout: 30000 })
    await start.click()
    await waitForListing(page)
    for (const name of ['王明', '李研', '周理', '陈书', '刘市', '赵审']) {
      await page.getByRole('button', { name: `查看${name}的资料`, exact: true }).click()
      const recent = page.locator('.member-recent-events')
      await expect(recent).not.toContainText('暂无动态')
      await expect(recent).toContainText('已完成')
      if (name !== '王明') {
        await expect(recent).toContainText('收到负责人安排')
        await expect(recent).toContainText('开始执行')
      }
      await page.getByRole('button', { name: '查看完整档案', exact: true }).click()
      const archive = page.getByRole('dialog', { name: `${name}的档案`, exact: true })
      await expect(archive.locator('.member-profile-events')).toContainText('待命')
      await expect(archive.locator('.member-profile-events')).toContainText('开始执行')
      await expect(archive.locator('.member-profile-events')).toContainText('已完成')
      await page.getByRole('button', { name: '关闭成员窗口', exact: true }).click()
    }
    await testInfo.attach('member-personal-activity', { body: await page.screenshot(), contentType: 'image/png' })
  })

  test('commerce demo expires safely after a three-minute browser suspension', async ({ page, service }, testInfo) => {
    await page.clock.install()
    await page.goto(`${service.url}/office/`)
    await expect(page.getByText(/正在加载办公室/)).toHaveCount(0, { timeout: 30000 })
    const start = page.getByRole('button', { name: '开始演示', exact: true })
    await expect(start).toBeEnabled({ timeout: 30000 })
    await start.click()
    const readSnapshot = async () => {
      const pending = page.waitForEvent('download')
      await page.getByRole('button', { name: '导出快照', exact: true }).click()
      return JSON.parse(await readFile((await (await pending).path())!, 'utf8')) as {
        records: { command: { commandId: string; capability?: string }; status: string; error?: { code: string } }[]
      }
    }
    await page.clock.fastForward(1000)
    const first = (await readSnapshot()).records.filter(record => record.command.capability === 'office.visit').map(record => record.command.commandId)
    expect(first).toHaveLength(1)
    for (let i = 0; i < 35; i++) await page.clock.fastForward(1000)
    await page.clock.fastForward(180001)
    for (let i = 0; i < 35; i++) await page.clock.fastForward(1000)
    const resumed = await readSnapshot()
    expect(resumed.records.filter(record => record.error)).toEqual([])
    expect(resumed.records.filter(record => first.includes(record.command.commandId)).map(record => record.status)).toEqual(['completed'])
    await expect(page.getByRole('button', { name: '开始演示', exact: true })).toBeVisible()
    await expect(page.getByRole('complementary', { name: '待你决定', exact: true })).toBeHidden()
    const canvas = page.locator('canvas'), stats = await sharp(await canvas.screenshot()).stats()
    expect(stats.channels[0].stdev).toBeGreaterThan(10)
    await testInfo.attach('resumed-demo', { body: await page.screenshot(), contentType: 'image/png' })
  })

  for (const mobile of [false, true]) test(`starting the demo reopens current and background questions after expiry (${mobile ? 'mobile' : 'desktop'})`, async ({ page, service }, testInfo) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 })
    await page.clock.install()
    await page.goto(`${service.url}/office/`)
    await expect(page.getByText(/正在加载办公室/)).toHaveCount(0, { timeout: 30000 })
    const start = page.getByRole('button', { name: '开始演示', exact: true })
    await expect(start).toBeEnabled({ timeout: 30000 })
    await page.clock.fastForward(61000)
    const panel = page.getByRole('complementary', { name: '待你决定', exact: true })
    const notice = page.getByRole('region', { name: '经营分析团队待决定提示', exact: true })
    await expect(panel).toBeHidden()
    await expect(notice).toBeHidden()
    await start.click()
    await advanceDemo(page, 14000)
    await expect(panel).toBeHidden()
    await expect(notice).toBeHidden()
    await waitForListing(page)
    await expect(panel.getByRole('heading', { name: '是否按 79 元上架电脑支架？' })).toBeVisible()
    await expect(panel).toContainText('1 项待处理')
    await expect(panel.getByRole('radio')).toHaveCount(0)
    const countdown = panel.getByRole('progressbar', { name: '选择剩余时间' })
    expect(Number(await countdown.getAttribute('aria-valuenow'))).toBeGreaterThan(90)
    const currentScreenshot = testInfo.outputPath('start-demo-current.png')
    await page.screenshot({ path: currentScreenshot })
    await testInfo.attach('start-demo-current', { path: currentScreenshot, contentType: 'image/png' })
    await panel.getByRole('button', { name: '确认上架', exact: true }).click()
    await advanceDemo(page, 4100)
    await expect(notice.getByRole('heading', { name: '电脑支架下一步怎么优化？' })).toBeVisible()
    const sideCountdown = notice.getByRole('progressbar', { name: '问题剩余有效时间' })
    await expect(sideCountdown).toBeInViewport()
    expect(Number(await sideCountdown.getAttribute('aria-valuenow'))).toBeGreaterThan(90)
    await expect(page.locator('.team-decision-notice')).toHaveCount(1)
    await expect(notice.getByRole('radio')).toHaveCount(3)
    await expect(panel).toBeHidden()
    const sideScreenshot = testInfo.outputPath('start-demo-background.png')
    await page.screenshot({ path: sideScreenshot })
    await testInfo.attach('start-demo-background', { path: sideScreenshot, contentType: 'image/png' })
    await page.getByRole('button', { name: '停止演示', exact: true }).click()
    await expect(notice).toBeHidden()
    await start.click()
    await waitForListing(page)
    await expect(panel.getByRole('heading', { name: '是否按 79 元上架电脑支架？' })).toBeVisible()
    await panel.getByRole('button', { name: '确认上架', exact: true }).click()
    await advanceDemo(page, 4100)
    await expect(notice.getByRole('heading', { name: '电脑支架下一步怎么优化？' })).toBeVisible()
    expect(Number(await sideCountdown.getAttribute('aria-valuenow'))).toBeGreaterThan(90)
    await notice.getByRole('button', { name: '进入经营分析团队办公室', exact: true }).click()
    await expect(panel.getByRole('heading', { name: '电脑支架下一步怎么优化？' })).toBeVisible()
    await expect(page.locator('.team-decision-notice')).toHaveCount(0)
    await page.getByRole('button', { name: '开始演示', exact: true }).click()
    await waitForListing(page)
    await expect(panel.getByRole('heading', { name: '是否按 79 元上架电脑支架？' })).toBeVisible()
    await panel.getByRole('button', { name: '确认上架', exact: true }).click()
    await advanceDemo(page, 4100)
    await expect(page.getByRole('region', { name: '电商运营团队待决定提示', exact: true })).toBeVisible()
  })

  for (const mobile of [false, true]) test(`side notice shares the question deadline without a six-second dismissal (${mobile ? 'mobile' : 'desktop'})`, async ({ page, service }, testInfo) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 })
    await page.clock.install()
    await page.goto(`${service.url}/office/`)
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30000 })
    await expect(page.getByText(/正在加载办公室/)).toHaveCount(0, { timeout: 30000 })
    await page.getByRole('button', { name: '开始演示', exact: true }).click()
    await waitForListing(page)
    await page.getByRole('button', { name: '确认上架', exact: true }).click()
    await advanceDemo(page, 4100)
    const notice = page.getByRole('region', { name: '经营分析团队待决定提示' })
    const progress = notice.getByRole('progressbar', { name: '问题剩余有效时间' })
    await expect(progress).toBeVisible()
    const initial = Number(await progress.getAttribute('aria-valuenow'))
    await page.clock.fastForward(10000)
    await expect(notice).toBeVisible()
    if (mobile) await page.locator('.runtime-workspace').evaluate(element => { element.scrollTop = element.scrollHeight })
    await expect(progress).toBeInViewport()
    if (mobile) {
      await expect(page.getByRole('complementary', { name: '待你决定' })).toBeHidden()
      await expect(notice.getByRole('button', { name: '先选择一项', exact: true })).toBeInViewport()
    }
    await expect.poll(async () => Number(await progress.getAttribute('aria-valuenow'))).toBeLessThan(initial - 10)
    await expect(progress.locator('i')).toHaveCSS('background-color', 'rgb(42, 186, 131)')
    const screenshot = testInfo.outputPath(`side-notice-${mobile ? 'mobile' : 'desktop'}.png`)
    await notice.screenshot({ path: screenshot })
    await testInfo.attach('side-notice-countdown', { path: screenshot, contentType: 'image/png' })
    const sideSeconds = Number.parseInt((await progress.getAttribute('aria-valuetext'))!)
    const beforeSwitch = await page.evaluate(() => performance.now())
    await notice.getByRole('button', { name: '进入经营分析团队办公室', exact: true }).click()
    const menuProgress = page.getByRole('complementary', { name: '待你决定' }).getByRole('progressbar', { name: '选择剩余时间' })
    await expect(menuProgress).toBeVisible()
    const menuSeconds = Number.parseInt((await menuProgress.getAttribute('aria-valuetext'))!)
    const switchingSeconds = (await page.evaluate(() => performance.now()) - beforeSwitch) / 1000
    expect(menuSeconds).toBeLessThanOrEqual(sideSeconds)
    expect(Math.abs(menuSeconds - (sideSeconds - switchingSeconds))).toBeLessThanOrEqual(2)
    await selectOffice(page, '电商运营团队')
    await expect(notice).toBeVisible()
    const returnedSeconds = Number.parseInt((await progress.getAttribute('aria-valuetext'))!)
    expect(returnedSeconds).toBeLessThanOrEqual(menuSeconds)
    expect(returnedSeconds).toBeLessThan(55)
    await page.clock.fastForward(61000)
    await expect(page.locator('.team-decision-notice')).toHaveCount(0)
    await expect(page.getByRole('complementary', { name: '待你决定' })).toBeHidden()
  })

  for (const mobile of [false, true]) test(`the single background choice resolves in place without another queued question (${mobile ? 'mobile' : 'desktop'})`, async ({ page, service }, testInfo) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 })
    await page.clock.install()
    await page.goto(`${service.url}/office/`)
    await expect(page.getByText(/正在加载办公室/)).toHaveCount(0, { timeout: 30000 })
    await page.getByRole('button', { name: '开始演示', exact: true }).click()
    await waitForListing(page)
    await expect(page.locator('.office-decision-card')).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.95)')
    await expect(page.locator('.office-decision-card')).toHaveCSS('backdrop-filter', 'none')
    await expect(page.locator('.office-decision-card h3')).toHaveCSS('font-size', mobile ? '16px' : '17px')
    await page.getByRole('button', { name: '确认上架', exact: true }).click()
    await advanceDemo(page, 4100)
    const notice = page.getByRole('region', { name: '经营分析团队待决定提示' })
    await expect(notice.getByRole('heading', { name: '电脑支架下一步怎么优化？' })).toBeVisible()
    await expect(notice).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.7)')
    await expect(notice.getByRole('heading')).toHaveCSS('opacity', '1')
    await expect(notice.getByRole('heading')).toHaveCSS('font-size', '10px')
    await expect(notice.locator('label strong').first()).toHaveCSS('font-size', '10px')
    await expect(notice.locator('.team-decision-notice-meta')).toHaveCSS('font-size', '9px')
    await expect(notice.locator('.team-decision-notice-description')).toHaveCSS('clip-path', 'inset(50%)')
    await expect(notice.locator('.team-decision-notice-option-detail').first()).toHaveCSS('clip-path', 'inset(50%)')
    const compactBounds = (await notice.boundingBox())!
    expect(compactBounds.width).toBeLessThanOrEqual(224)
    expect(compactBounds.height).toBeLessThan(216)
    await expect(notice).toHaveCSS('opacity', '1')
    const optionRows = notice.locator('label')
    for (let index = 0; index < await optionRows.count(); index++) {
      const row = optionRows.nth(index)
      const beforeHover = (await row.boundingBox())!
      await row.hover()
      await expect(row).toHaveCSS('background-color', 'rgb(240, 244, 240)')
      const bounds = (await row.boundingBox())!, radio = (await row.locator('input').boundingBox())!, text = (await row.locator('strong').boundingBox())!
      expect(bounds.height).toBe(beforeHover.height)
      expect(Math.abs(bounds.y + bounds.height / 2 - (radio.y + radio.height / 2))).toBeLessThanOrEqual(.5)
      expect(Math.abs(bounds.y + bounds.height / 2 - (text.y + text.height / 2))).toBeLessThanOrEqual(.5)
    }
    const alignmentScreenshot = testInfo.outputPath('side-option-alignment.png')
    await notice.screenshot({ path: alignmentScreenshot })
    await testInfo.attach('side-option-alignment', { path: alignmentScreenshot, contentType: 'image/png' })
    await expect(notice.getByRole('button', { name: '进入经营分析团队办公室', exact: true })).toBeInViewport()
    const waitingButton = notice.getByRole('button', { name: '先选择一项', exact: true })
    await expect(waitingButton).toBeDisabled()
    await expect(waitingButton).toHaveCSS('opacity', '1')
    await expect(waitingButton).toHaveCSS('background-color', 'rgb(227, 238, 230)')
    await expect(waitingButton).toHaveCSS('color', 'rgb(82, 103, 90)')
    await expect(waitingButton).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)')
    const waitingWidth = (await waitingButton.boundingBox())!.width
    await notice.getByRole('radio', { name: /补充尺寸说明/ }).check()
    await expect(notice.getByRole('button', { name: '提交选择', exact: true })).toHaveCSS('color', 'rgb(255, 255, 255)')
    await expect(notice.getByRole('button', { name: '提交选择', exact: true })).toHaveCSS('background-color', 'rgb(69, 103, 83)')
    expect((await notice.getByRole('button', { name: '提交选择', exact: true }).boundingBox())!.width).toBe(waitingWidth)
    await notice.getByRole('button', { name: '提交选择', exact: true }).click()
    await expect(notice).toBeHidden()
    await advanceDemo(page, 5000)
    await expect(page.locator('.team-decision-notice')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^团队空间，当前团队：电商运营团队/ })).toBeVisible()
    await finishOptimization(page)
    await expect(page.getByRole('button', { name: '开始演示', exact: true })).toBeVisible()
    await selectOffice(page, '经营分析团队')
    await page.getByRole('button', { name: '展开对话', exact: true }).click()
    const transcript = page.getByRole('log', { name: '对话内容', exact: true })
    await expect(transcript.getByRole('heading', { name: '商品优化复盘', exact: true })).toBeVisible()
    for (const value of ['350', '14', '4.0%', '1106 元']) await expect(transcript).toContainText(value)
    await testInfo.attach('commerce-complete', { body: await page.screenshot(), contentType: 'image/png' })
  })

  test('the local preview shows a countdown, expires and restarts on replay', async ({ page, service }, testInfo) => {
    await page.clock.install()
    await page.goto(`${service.url}/office/`)
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30000 })
    await expect(page.getByText(/正在加载办公室/)).toHaveCount(0, { timeout: 30000 })
    const panel = page.getByRole('complementary', { name: '待你决定' })
    await expect(panel).toBeHidden()
    await page.getByRole('button', { name: '开始演示', exact: true }).click()
    await waitForListing(page)
    await expect(panel).toContainText('本地演示')
    await expect(panel.getByRole('heading', { name: '是否按 79 元上架电脑支架？' })).toBeVisible()
    const progress = panel.getByRole('progressbar', { name: '选择剩余时间' })
    await expect(progress).toBeVisible()
    const initial = Number(await progress.getAttribute('aria-valuenow'))
    await page.clock.fastForward(3000)
    await expect.poll(async () => Number(await progress.getAttribute('aria-valuenow'))).toBeLessThan(initial - 3)
    await testInfo.attach('local-demo-countdown', { body: await panel.locator('.office-decision-card').screenshot(), contentType: 'image/png' })
    await page.clock.fastForward(61000)
    await expect(panel).toBeHidden()
    await page.getByRole('button', { name: '展开对话', exact: true }).click()
    await expect(page.getByLabel('决策记录', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: '收起聊天', exact: true }).click()
    await page.getByRole('button', { name: '开始演示', exact: true }).click()
    await waitForListing(page)
    await expect(progress).toBeVisible()
    expect(Number(await progress.getAttribute('aria-valuenow'))).toBeGreaterThan(95)
    await expect(panel).toContainText('1 项待处理')
    await page.clock.fastForward(5000)
    await panel.getByRole('button', { name: '暂不上架', exact: true }).click()
    await expect(panel.getByRole('heading')).toHaveCount(0)
    await panel.getByRole('button', { name: '重新演示', exact: true }).click()
    await expect(panel).toBeHidden()
    await waitForListing(page)
    expect(Number(await progress.getAttribute('aria-valuenow'))).toBeGreaterThan(95)
    await panel.getByRole('button', { name: '暂不上架', exact: true }).click()
    await page.clock.fastForward(3100)
    await expect(panel).toBeHidden()
    await page.getByRole('button', { name: '展开对话', exact: true }).click()
    await expect(page.getByRole('log', { name: '对话内容', exact: true })).toContainText('本轮不生成销售数据')
  })
})
