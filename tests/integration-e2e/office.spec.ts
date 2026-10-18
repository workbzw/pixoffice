import { randomUUID } from 'node:crypto'
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

test('initializes two offices and keeps task and whiteboard data separate', async ({ backend, page, service }, testInfo) => {
  const a = office(), b = office('team-b')
  b.tasks[0].title = '产品调研验收'; b.whiteboard.title = '产品调研计划'
  const initialized = await backend.post({ type: 'offices.initialize', offices: [a, b] })
  expect(initialized.code).toBe(202)
  await openOffice(page, service.url)
  await expect(page.locator('.runtime-task-list')).toContainText(a.tasks[0].title)
  const board = await showBoard(page)
  await expect(board).toContainText(a.whiteboard.title)
  await page.getByRole('button', { name: '关闭白板', exact: true }).click()
  await selectOffice(page, b.workspace.name)
  await expect(page.locator('.runtime-task-list')).toContainText(b.tasks[0].title)
  await expect(page.locator('.runtime-task-list')).not.toContainText(a.tasks[0].title)
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
  await expect(page.locator('.runtime-task-detail')).toContainText(state.tasks[0].summary!)
  state.seq = 2; state.tasks[0].status = 'completed'; state.tasks[0].progress = 100
  state.whiteboard.status = 'completed'; state.whiteboard.steps[0].progress = 100
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
  state.whiteboard.steps[0].progress = 0
  await backend.post({ type: 'offices.initialize', offices: [state] }); await openOffice(page, service.url)
  const reader = await showBoard(page), bar = reader.getByRole('progressbar', { name: state.whiteboard.steps[0].title, exact: true })
  const first = Number(await bar.getAttribute('aria-valuenow'))
  await expect.poll(async () => Number(await bar.getAttribute('aria-valuenow'))).toBeGreaterThan(first + 2)
  expect((await backend.read('team-a')).data.snapshot.whiteboard.steps[0].progress).toBe(0)
  state.seq = 2; state.whiteboard.steps[0].progress = 100
  expect((await backend.post({ type: 'office.snapshot', teamId: 'team-a', snapshot: state })).code).toBe(200)
  await expect(bar).toHaveAttribute('aria-valuenow', '99')
  await expect(reader).toContainText('执行中')
  state.seq = 3; state.whiteboard.status = 'completed'; state.whiteboard.steps[0].progress = 25
  expect((await backend.post({ type: 'office.snapshot', teamId: 'team-a', snapshot: state })).code).toBe(200)
  await expect(bar).toHaveAttribute('aria-valuenow', '100')
  await expect(reader).toContainText('已完成')
  expect((await backend.read('team-a')).data.snapshot.whiteboard.steps[0].progress).toBe(25)
  await page.getByRole('button', { name: '关闭白板', exact: true }).click()
  await expect((await showBoard(page)).getByRole('progressbar', { name: state.whiteboard.steps[0].title, exact: true })).toHaveAttribute('aria-valuenow', '100')
  state.seq = 4; state.whiteboard.title = '下一个开发任务'; state.whiteboard.status = 'running'; state.whiteboard.steps[0].progress = 0
  await backend.post({ type: 'office.snapshot', teamId: 'team-a', snapshot: state })
  await expect(reader).toContainText('下一个开发任务')
  expect(Number(await bar.getAttribute('aria-valuenow'))).toBeLessThan(99)
})

test('a person click reaches the backend and dialog options return another user action', async ({ backend, page, service }) => {
  await backend.post({ type: 'offices.initialize', offices: [office()] })
  await openOffice(page, service.url)
  const waiting = backend.next(), canvas = page.locator('canvas'), bounds = await canvas.boundingBox()
  await canvas.click({ position: { x: bounds!.width * .3, y: bounds!.height * .42 } })
  const action = (await waiting).data.actions[0]
  expect(action).toMatchObject({ teamId: 'team-a', action: 'actor.inspect', actorId: 'office-lead' })
  expect((await backend.respond(action.id, { target: 'dialog', content: { template: 'detail-v1', title: '开发员实时详情', description: '后端返回的详情。',
    fields: [{ label: '任务', value: '登录模块验收' }], actions: [{ id: 'review', label: '提交验收' }] } })).code).toBe(200)
  const dialog = page.getByRole('dialog', { name: '开发员实时详情' })
  await expect(dialog).toContainText('后端返回的详情。')
  const next = backend.next()
  await dialog.getByRole('button', { name: '提交验收', exact: true }).click()
  const option = (await next).data.actions[0]
  expect(option).toMatchObject({ action: 'dialog.action', interactionId: action.id, optionId: 'review', teamId: 'team-a' })
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
  expect(action).toMatchObject({ action: 'task.complete', taskId: 'login', teamId: 'team-a' })
  state.seq = 2; state.tasks[0].status = 'completed'; state.tasks[0].progress = 100
  state.whiteboard.title = '后端确认任务完成'; state.whiteboard.status = 'completed'; state.whiteboard.steps[0].progress = 100
  expect((await backend.respond(action.id, { target: 'whiteboard', snapshot: state })).code).toBe(200)
  await expect(page.getByText('等待后端处理…', { exact: true })).toBeHidden()
  await expect(await showBoard(page)).toContainText('后端确认任务完成')
})

for (const choice of ['confirm', 'reject']) test(`confirmation menu returns ${choice} through its original request`, async ({ backend, page, service }) => {
  await backend.post({ type: 'offices.initialize', offices: [office()] })
  await openOffice(page, service.url)
  const pending = backend.post<{ choiceId: string; decisionId: string }>({ type: 'decision.request', teamId: 'team-a', timeoutMs: 10000,
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
  const pending = backend.post<{ choiceId: string }>({ type: 'decision.request', teamId: 'team-a', timeoutMs: 15000,
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
  const pending = backend.post<{ reasonCode: string }>({ type: 'decision.request', teamId: 'team-a', timeoutMs: 5000,
    decision: { id: 'timeout', kind: 'confirmation', title: '即将过期的验收' } })
  const title = page.getByRole('heading', { name: '即将过期的验收' })
  await expect(title).toBeVisible()
  const progress = page.getByRole('progressbar', { name: '选择剩余时间' })
  await expect(progress).toBeVisible()
  const initial = Number(await progress.getAttribute('aria-valuenow'))
  await expect.poll(async () => Number(await progress.getAttribute('aria-valuenow')), { timeout: 3000, intervals: [250] }).toBeLessThan(initial - 10)
  expect((await pending).code).toBe(408)
  await expect(title).toBeHidden()
  expect((await backend.read('team-a')).data.pendingDecisions).toEqual([])
})

test('a background-office menu remains assigned to its office during switching', async ({ backend, page, service }) => {
  const a = office(), b = office('team-b')
  await backend.post({ type: 'offices.initialize', offices: [a, b] }); await openOffice(page, service.url)
  const pending = backend.post<{ teamId: string }>({ type: 'decision.request', teamId: 'team-b', timeoutMs: 15000,
    decision: { id: 'background', kind: 'confirmation', title: '产品团队的确认' } })
  await expect(page.getByRole('button', { name: /^团队空间，当前团队.*1 项待确认/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: '产品团队的确认' })).toBeHidden()
  await selectOffice(page, b.workspace.name)
  await page.getByRole('complementary', { name: '待你决定' }).getByRole('button', { name: '确认', exact: true }).click()
  expect((await pending).data.teamId).toBe('team-b')
})

test('real animation changes both the visible canvas and public actor state', async ({ backend, page, service }, testInfo) => {
  const state = office(); state.tasks = []
  await backend.post({ type: 'offices.initialize', offices: [state] }); await openOffice(page, service.url)
  const discovered = await backend.post<Capabilities>({ type: 'office.capabilities' })
  expect(discovered.data.scene.capabilities.some(capability => capability.id === 'office.visit')).toBe(true)
  const actors = discovered.data.scene.actors, visitor = actors[0], host = actors[1]
  const previous = (await backend.read('team-a')).data.scene.actors.find(actor => actor.id === visitor.id)!.position
  const canvas = page.locator('canvas'), before = await canvas.screenshot()
  expect((await backend.command('team-a', 'office.visit', [{ entityId: visitor.id, role: 'visitor' }, { entityId: host.id, role: 'host' }],
    { stops: [{ hostId: host.id, message: '请验收本次交付。' }], durationMs: 3000 })).code).toBe(200)
  await expect.poll(async () => (await backend.read('team-a')).data.scene.actors.find(actor => actor.id === visitor.id)!.position,
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
  state.seq = 2; state.tasks[0].title = '离线期间更新的任务'
  const updated = await backend.post({ type: 'office.snapshot', teamId: 'team-a', snapshot: state })
  expect([200, 202, 408]).toContain(updated.code)
  await context.setOffline(false)
  await expect(page.locator('.runtime-task-list')).toContainText(state.tasks[0].title, { timeout: 20000 })
  await page.reload(); await openOffice(page, service.url)
  await expect(page.locator('.runtime-task-list')).toContainText(state.tasks[0].title)
  const another = await context.newPage(); await openOffice(another, service.url)
  await expect(another.locator('.runtime-task-list')).toContainText(state.tasks[0].title)
  expect((await backend.read('team-a')).data.snapshot.seq).toBe(2)
})

test('server restart clears the stale directory and accepts fresh initialization', async ({ backend, page, service }) => {
  const state = office(); state.seq = 5
  await backend.post({ type: 'offices.initialize', offices: [state] }); await openOffice(page, service.url)
  await service.restart()
  await expect(page.getByText('等待后端初始化办公室', { exact: true })).toBeVisible({ timeout: 20000 })
  expect((await backend.post<{ offices: object[] }>({ type: 'office.read' })).data.offices).toEqual([])
  expect((await backend.read('team-a')).code).toBe(404)
  const fresh = office(); fresh.tasks[0].title = '重启后的新任务'
  expect((await backend.post({ type: 'offices.initialize', offices: [fresh] })).code).toBe(200)
  await expect(page.locator('.runtime-task-list')).toContainText(fresh.tasks[0].title)
  expect((await backend.read('team-a')).data.snapshot.seq).toBe(1)
})

test('duplicate, conflicting, invalid and concurrent out-of-order updates preserve latest state in two pages', async ({ backend, page, context, service }) => {
  const state = office()
  await backend.post({ type: 'offices.initialize', offices: [state] }); await openOffice(page, service.url)
  const second = await context.newPage(); await openOffice(second, service.url)
  expect((await backend.post({ type: 'office.snapshot', teamId: 'team-a', snapshot: state })).code).toBe(200)
  const conflict = structuredClone(state); conflict.tasks[0].title = '相同版本冲突'
  expect((await backend.post({ type: 'office.snapshot', teamId: 'team-a', snapshot: conflict })).code).toBe(409)
  expect((await backend.post({ type: 'office.read' }, { key: 'incorrect' })).code).toBe(401)
  expect((await backend.post({ type: 'office.snapshot', teamId: 'team-a', snapshot: { ...state, whiteboard: null } })).code).toBe(400)
  expect((await backend.post({ type: 'office.unknown' })).code).toBe(400)
  const requests = [9, 3, 12, 2, 5, 8, 11, 4, 7, 10, 6].map(seq => {
    const next = structuredClone(state); next.seq = seq; next.tasks[0].title = `并发任务 ${seq}`
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
  const pending = backend.post<{ choiceId: string }>({ type: 'decision.request', teamId: 'team-a', timeoutMs: 15000,
    decision: { id: randomUUID(), kind: 'confirmation', title: '移动端确认', confirmLabel: '确认验收', rejectLabel: '返回检查' } })
  await page.getByRole('button', { name: '确认验收', exact: true }).click()
  expect((await pending).data.choiceId).toBe('confirm')
  await testInfo.attach('mobile-office', { body: await page.screenshot(), contentType: 'image/png' })
})

test.describe('static local demo', () => {
  test.use({ staticDemo: true })

  for (const mobile of [false, true]) test(`side notice shares the question deadline without a six-second dismissal (${mobile ? 'mobile' : 'desktop'})`, async ({ page, service }, testInfo) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 })
    await page.clock.install()
    await page.goto(`${service.url}/office/`)
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30000 })
    await expect(page.getByText(/正在加载办公室/)).toHaveCount(0, { timeout: 30000 })
    const notice = page.getByRole('status', { name: '内容运营团队待决定提示' })
    const progress = notice.getByRole('progressbar', { name: '问题剩余有效时间' })
    await expect(progress).toBeVisible()
    const initial = Number(await progress.getAttribute('aria-valuenow'))
    await page.clock.fastForward(10000)
    await expect(notice).toBeVisible()
    await expect(progress).toBeInViewport()
    if (mobile) {
      const noticeBounds = await notice.boundingBox(), menuBounds = await page.locator('.office-decision-card').boundingBox()
      expect(noticeBounds!.y + noticeBounds!.height).toBeLessThanOrEqual(menuBounds!.y)
    }
    await expect.poll(async () => Number(await progress.getAttribute('aria-valuenow'))).toBeLessThan(initial - 10)
    await expect(progress.locator('i')).toHaveCSS('background-color', 'rgb(42, 186, 131)')
    const screenshot = testInfo.outputPath(`side-notice-${mobile ? 'mobile' : 'desktop'}.png`)
    await notice.screenshot({ path: screenshot })
    await testInfo.attach('side-notice-countdown', { path: screenshot, contentType: 'image/png' })
    const sideSeconds = Number.parseInt((await progress.getAttribute('aria-valuetext'))!)
    const beforeSwitch = await page.evaluate(() => performance.now())
    await notice.getByRole('button', { name: '前往处理内容运营团队的确认请求', exact: true }).click()
    const menuProgress = page.getByRole('complementary', { name: '待你决定' }).getByRole('progressbar', { name: '选择剩余时间' })
    await expect(menuProgress).toBeVisible()
    const menuSeconds = Number.parseInt((await menuProgress.getAttribute('aria-valuetext'))!)
    const switchingSeconds = (await page.evaluate(() => performance.now()) - beforeSwitch) / 1000
    expect(menuSeconds).toBeLessThanOrEqual(sideSeconds)
    expect(Math.abs(menuSeconds - (sideSeconds - switchingSeconds))).toBeLessThanOrEqual(2)
    await selectOffice(page, '登录模块开发')
    await expect(notice).toBeVisible()
    const returnedSeconds = Number.parseInt((await progress.getAttribute('aria-valuetext'))!)
    expect(returnedSeconds).toBeLessThanOrEqual(menuSeconds)
    expect(returnedSeconds).toBeLessThan(55)
    await page.clock.fastForward(61000)
    await expect(page.locator('.team-decision-notice')).toHaveCount(0)
    await expect(page.getByRole('complementary', { name: '待你决定' })).toBeHidden()
  })

  test('the local preview shows a countdown, expires and restarts on replay', async ({ page, service }, testInfo) => {
    await page.clock.install()
    await page.goto(`${service.url}/office/`)
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30000 })
    await expect(page.getByText(/正在加载办公室/)).toHaveCount(0, { timeout: 30000 })
    const panel = page.getByRole('complementary', { name: '待你决定' })
    await expect(panel).toContainText('本地演示')
    await expect(panel.getByRole('heading', { name: '下一步优先推进哪一项？' })).toBeVisible()
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
    await page.getByRole('button', { name: '重新演示决策', exact: true }).click()
    await expect(progress).toBeVisible()
    expect(Number(await progress.getAttribute('aria-valuenow'))).toBeGreaterThan(95)
    await panel.getByRole('radio', { name: /先补齐测试/ }).check()
    await page.clock.fastForward(5000)
    await page.getByRole('button', { name: '展开对话', exact: true }).click()
    await page.getByRole('button', { name: '重新演示决策', exact: true }).click()
    expect(Number(await progress.getAttribute('aria-valuenow'))).toBeGreaterThan(95)
    await expect(panel.getByRole('radio', { name: /先补齐测试/ })).not.toBeChecked()
    await panel.getByRole('radio', { name: /先补齐测试/ }).check()
    await panel.getByRole('button', { name: '提交选择', exact: true }).click()
    await expect(panel.getByRole('heading', { name: '是否提交本轮审核？' })).toBeVisible()
    await expect(progress).toBeVisible()
    await page.getByRole('button', { name: '展开对话', exact: true }).click()
    await page.getByRole('button', { name: '重新演示决策', exact: true }).click()
    expect(Number(await progress.getAttribute('aria-valuenow'))).toBeGreaterThan(95)
  })
})
