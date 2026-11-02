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

for (const layoutId of ['classic', 'members', 'rounded'] as const) {
  test(`chat composer only expands the transcript in the ${layoutId} layout`, async ({ page }) => {
    const state = office(), other = structuredClone(state.conversations[0])
    other.id = 'review'; other.title = '复盘会话'; state.conversations.push(other)
    await backend.post({ type: 'offices.initialize', offices: [state], layoutId })
    await page.goto(`${url}/office/`)
    const expand = page.getByRole('button', { name: '展开对话', exact: true })
    const panel = page.getByRole('region', { name: '办公室对话', exact: true })
    const input = page.getByRole('textbox', { name: '给办公室发送消息' })
    await expect(expand).toHaveAttribute('aria-expanded', 'false')
    await expand.click()
    await expect(panel).toBeVisible()
    await expect(expand).toHaveAttribute('aria-expanded', 'true')
    await input.fill('保留当前会话草稿')
    await expand.click()
    await expect(page.getByRole('dialog', { name: '全部会话', exact: true })).toHaveCount(0)
    await expect(input).toHaveValue('保留当前会话草稿')
    await page.getByRole('tab', { name: '复盘会话', exact: true }).click()
    await expect(expand).toContainText('复盘会话')
    await page.setViewportSize({ width: 390, height: 844 })
    await expand.click()
    await expect(page.getByRole('dialog', { name: '全部会话', exact: true })).toHaveCount(0)
    await expect(panel).toBeVisible()
    await page.getByRole('button', { name: '收起聊天', exact: true }).click()
    await expect(expand).toHaveAttribute('aria-expanded', 'false')
    await expand.click()
    await expect(panel).toBeVisible()
    await page.getByRole('button', { name: '删除会话：复盘会话', exact: true }).click()
    const confirmation = page.getByRole('alertdialog', { name: '删除会话', exact: true })
    await expect(confirmation).toBeVisible()
    await confirmation.getByRole('button', { name: '取消', exact: true }).click()
    await expect(confirmation).toHaveCount(0)
    await expect(page.getByRole('tab', { name: '复盘会话', exact: true })).toHaveAttribute('aria-selected', 'true')
  })
}

test('dispatch is an isolated entry with live multi-office overview and one shared preview renderer', async ({ page }, testInfo) => {
  const states = Array.from({ length: 7 }, (_, index) => {
    const state = office(`dispatch-${index}`)
    state.workspace.name = `调度团队${index + 1}`
    state.conversations[0].tasks[0].status = index === 1 ? 'running' : 'queued'
    state.conversations[0].whiteboard.title = `办公室目标${index + 1}`
    return state
  })
  const hidden = structuredClone(states[0].conversations[0])
  hidden.id = 'background'; hidden.title = '后台会话'; hidden.tasks[0].status = 'running'
  hidden.whiteboard.title = '后台正在运行的目标'
  states[0].conversations.push(hidden)
  expect((await backend.post({ type: 'offices.initialize', offices: states, layoutId: 'members' })).code).toBe(202)
  await page.addInitScript(() => {
    const probe = window as typeof window & { dispatchReveal?: Animation; dispatchOpening?: { visibility: string; width: number }[]; dispatchContexts?: Set<HTMLCanvasElement> }
    probe.dispatchOpening = []
    probe.dispatchContexts = new Set()
    HTMLCanvasElement.prototype.getContext = new Proxy(HTMLCanvasElement.prototype.getContext, {
      apply(target, canvas, args) {
        const context = Reflect.apply(target, canvas, args)
        if (context && /^webgl/.test(args[0])) probe.dispatchContexts!.add(canvas)
        return context
      },
    })
    const showModal = HTMLDialogElement.prototype.showModal
    HTMLDialogElement.prototype.showModal = function () {
      showModal.call(this)
      if (this.classList.contains('dispatch-overview')) probe.dispatchOpening!.push({ visibility: getComputedStyle(this).visibility, width: this.getBoundingClientRect().width })
    }
    const animate = Element.prototype.animate
    Element.prototype.animate = function (frames, options) {
      const animation = animate.call(this, frames, options)
      if (this.classList.contains('dispatch-overview') && Array.isArray(frames) && frames[0]?.opacity === 1 && frames.at(-1)?.opacity === 0) {
        animation.pause()
        probe.dispatchReveal = animation
      }
      return animation
    }
  })
  await page.goto(`${url}/dispatch/`)
  await page.waitForFunction(() => performance.getEntriesByName('pixoffice:scene-ready').length > 0)
  const brand = page.locator('.dispatch-office > .member-workspace .member-brand-row')
  const layoutTrigger = brand.locator('.office-layout-trigger')
  const brandBounds = (await brand.boundingBox())!, layoutBounds = (await layoutTrigger.boundingBox())!
  expect(layoutBounds.x + layoutBounds.width).toBeCloseTo(brandBounds.x + brandBounds.width)
  await expect(brand.locator('.member-office-control')).toBeHidden()
  const originalContexts = await page.evaluate(() => (window as typeof window & { dispatchContexts: Set<HTMLCanvasElement> }).dispatchContexts.size)
  const ring = page.locator('.dispatch-ring-button')
  await expect(ring).toHaveAccessibleName('办公室总览，2 个运行中，共 7 个办公室')
  await expect(ring.locator('span')).toHaveText('2/7')
  const origin = (await ring.boundingBox())!, viewport = page.viewportSize()!
  await ring.click()
  const dialog = page.getByRole('dialog', { name: '办公室总览', exact: true })
  await expect(dialog).toBeVisible()
  const initialFrames = await page.evaluate(() => (window as typeof window & { dispatchOpening: { visibility: string; width: number }[] }).dispatchOpening)
  expect(initialFrames.length).toBeGreaterThan(0)
  for (const frame of initialFrames) { expect(frame.visibility).toBe('hidden'); expect(frame.width).toBeCloseTo(origin.width) }
  await expect(dialog.locator('.dispatch-overview-ring > span')).toHaveText('2/7')
  const opening = await dialog.evaluate(element => element.getAnimations().map(animation => ({
    duration: animation.effect?.getTiming().duration,
    frames: (animation.effect as KeyframeEffect).getKeyframes().map(frame => {
      const matrix = new DOMMatrix(String(frame.transform))
      return { x: matrix.e, y: matrix.f, scaleX: matrix.a, scaleY: matrix.d }
    }),
  })))
  const expansion = opening.find(animation => animation.duration === 380)!
  expect(expansion.frames[0].x).toBeCloseTo(origin.x)
  expect(expansion.frames[0].y).toBeCloseTo(origin.y)
  expect(expansion.frames[0].scaleX).toBeCloseTo(origin.width / viewport.width, 5)
  expect(expansion.frames[0].scaleY).toBeCloseTo(origin.height / viewport.height, 5)
  expect(expansion.frames[1]).toEqual({ x: 0, y: 0, scaleX: 1, scaleY: 1 })
  await expect(dialog).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
  await expect(dialog.locator('.dispatch-office-card')).toHaveCount(7)
  const mainCanvas = page.locator('.dispatch-office > .member-workspace canvas')
  await expect(mainCanvas).toHaveCount(1)
  const live = dialog.locator('.dispatch-preview .dispatch-live-canvas[data-frame]')
  await expect(live).toHaveCount(7, { timeout: 30000 })
  expect(await page.evaluate(() => (window as typeof window & { dispatchContexts: Set<HTMLCanvasElement> }).dispatchContexts.size)).toBe(originalContexts + 1)
  const firstCard = dialog.getByRole('button', { name: '进入调度团队1', exact: true })
  const firstCanvas = firstCard.locator('.dispatch-live-canvas')
  const secondCanvas = dialog.locator('.dispatch-preview .dispatch-live-canvas').nth(1)
  const firstImage = await firstCanvas.evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL())
  expect(await secondCanvas.evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL())).not.toBe(firstImage)
  const firstFrame = Number(await firstCanvas.getAttribute('data-frame'))
  await expect.poll(async () => Number(await firstCanvas.getAttribute('data-frame'))).toBeGreaterThan(firstFrame)
  await expect(dialog.getByRole('button', { name: '进入调度团队1', exact: true })).toHaveAttribute('title', /后台正在运行的目标/)
  await expect(dialog.getByRole('textbox')).toHaveCount(0)
  for (const [width, columns] of [[1440, 4], [1100, 3], [800, 2], [390, 1]]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(dialog.locator('.dispatch-office-grid')).toHaveCSS('grid-template-columns', new RegExp(`^(?:[0-9.]+px ?){${columns}}$`))
    if (width === 390) {
      await expect(dialog.locator('.dispatch-live-page').first()).toHaveCSS('width', '1440px')
      await expect(dialog.locator('.dispatch-live-page .member-sidebar').first()).toHaveCSS('position', 'static')
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const bounds = await dialog.boundingBox()
    expect(bounds!.x).toBe(0)
    expect(bounds!.y).toBe(0)
    expect(bounds!.width).toBe(width)
    expect(bounds!.height).toBe(900)
    await testInfo.attach(`dispatch-${width}`, { body: await page.screenshot(), contentType: 'image/png' })
  }
  states[0].seq++
  states[0].conversations.forEach(conversation => { conversation.tasks[0].status = 'completed' })
  expect((await backend.post({ type: 'office.snapshot', teamId: states[0].workspace.id, snapshot: states[0] })).code).toBe(200)
  await expect(ring).toHaveAccessibleName('办公室总览，1 个运行中，共 7 个办公室')
  await expect(ring.locator('span')).toHaveText('1/7')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '进入调度团队1', exact: true }).locator('.dispatch-status')).toHaveText('已完成')
  await expect(dialog.getByRole('button', { name: '进入调度团队1', exact: true }).locator('.dispatch-status')).toHaveCSS('background-color', 'rgb(51, 51, 51)')
  await expect(dialog.locator('.dispatch-office-card')).toHaveCount(7)
  await expect.poll(() => firstCanvas.evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL())).not.toBe(firstImage)
  const target = dialog.getByRole('button', { name: '进入调度团队7', exact: true })
  await target.scrollIntoViewIfNeeded()
  await expect(target.locator('.dispatch-live-canvas')).toHaveAttribute('data-frame', /\d+/)
  await expect(firstCard.locator('.dispatch-live-canvas')).toHaveCount(0)
  const preview = (await target.locator('.dispatch-preview').boundingBox())!
  await target.click()
  const zoom = dialog.locator('.dispatch-office-zoom')
  await expect(zoom).toBeVisible()
  const entry = await zoom.evaluate(element => {
    const animation = element.getAnimations()[0]
    return { duration: animation.effect?.getTiming().duration, frames: (animation.effect as KeyframeEffect).getKeyframes().map(frame => ({
      x: parseFloat(String(frame.left)), y: parseFloat(String(frame.top)), width: parseFloat(String(frame.width)), height: parseFloat(String(frame.height)),
    })) }
  })
  expect(entry.duration).toBe(420)
  expect(entry.frames[0].x).toBeCloseTo(preview.x)
  expect(entry.frames[0].y).toBeCloseTo(preview.y)
  expect(entry.frames[0].width).toBeCloseTo(preview.width)
  expect(entry.frames[0].height).toBeCloseTo(preview.height)
  expect(entry.frames[1]).toEqual({ x: 0, y: 0, width: 390, height: 900 })
  await page.waitForFunction(() => !!(window as typeof window & { dispatchReveal?: Animation }).dispatchReveal)
  await dialog.evaluate(element => (element as HTMLElement).style.setProperty('opacity', '0', 'important'))
  const readyFrame = await mainCanvas.screenshot()
  await page.locator('.dispatch-overview').evaluate(element => (element as HTMLElement).style.removeProperty('opacity'))
  await page.evaluate(() => (window as typeof window & { dispatchReveal: Animation }).dispatchReveal.finish())
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.office-loading')).toHaveCount(0)
  const visibleFrame = await mainCanvas.screenshot()
  const before = await sharp(readyFrame).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const after = await sharp(visibleFrame).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  expect(before.info).toEqual(after.info)
  let changed = 0
  for (let index = 0; index < before.data.length; index += 3) {
    if (Math.abs(before.data[index] - after.data[index]) + Math.abs(before.data[index + 1] - after.data[index + 1]) + Math.abs(before.data[index + 2] - after.data[index + 2]) > 60) changed++
  }
  expect(changed / (before.info.width * before.info.height), 'the complete target frame must exist before the thumbnail fades, not only its room background').toBeLessThan(.025)
  await testInfo.attach('dispatch-target-before-reveal', { body: readyFrame, contentType: 'image/png' })
  await testInfo.attach('dispatch-target-after-reveal', { body: visibleFrame, contentType: 'image/png' })
  states[6].seq++
  states[6].conversations[0].tasks[0].title = '关闭实时预览后的任务更新'
  expect((await backend.post({ type: 'office.snapshot', teamId: states[6].workspace.id, snapshot: states[6] })).code).toBe(200)
  await expect(page.locator('.member-current-task')).toContainText('关闭实时预览后的任务更新')
  expect((await sharp(await mainCanvas.screenshot()).stats()).channels[0].stdev).toBeGreaterThan(10)
  await ring.click()
  await expect(dialog.getByRole('button', { name: '进入调度团队7', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(ring).toBeFocused()
  await ring.click()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(ring).toBeFocused()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await ring.click()
  await expect(dialog).toBeVisible()
  expect(await dialog.evaluate(element => element.getAnimations().every(animation => animation.effect?.getTiming().duration === 0))).toBe(true)
  await expect(dialog).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await page.goto(`${url}/office/`)
  await expect(page.locator('.member-workspace')).toBeVisible()
  await expect(page.locator('.dispatch-ring-button')).toHaveCount(0)
  await expect(page.locator('.dispatch-running-frame')).toHaveCount(0)
})

test('dispatch can enter another office before any thumbnail is ready', async ({ page }, testInfo) => {
  const states = [office('first-office'), office('second-office')]
  states[0].workspace.name = '办公室一'; states[1].workspace.name = '办公室二'
  states[1].conversations[0].tasks[0].title = '不等待缩略图即可进入的任务'
  await backend.post({ type: 'offices.initialize', offices: states, layoutId: 'members' })
  await page.goto(`${url}/dispatch/`)
  await page.waitForFunction(() => performance.getEntriesByName('pixoffice:scene-ready').length > 0)
  // Suspend only thumbnail sampling, without delaying the actual office scene.
  await page.evaluate(() => Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }))
  await page.locator('.dispatch-ring-button').click()
  const dialog = page.getByRole('dialog', { name: '办公室总览', exact: true })
  await expect(dialog).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
  await expect(dialog.locator('canvas[data-frame]')).toHaveCount(0)
  await dialog.getByRole('button', { name: '进入办公室二', exact: true }).click()
  await expect(dialog.locator('.dispatch-office-zoom')).toBeVisible()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.member-current-task')).toContainText('不等待缩略图即可进入的任务')
  await page.evaluate(() => Reflect.deleteProperty(document, 'hidden'))
  await testInfo.attach('dispatch-entry-without-thumbnail', { body: await page.screenshot(), contentType: 'image/png' })
})

test('the original members office keeps its frame ratio while the sidebar has bounded flexibility', async ({ page }) => {
  await backend.post({ type: 'offices.initialize', offices: [office()], layoutId: 'members' })
  await page.goto(`${url}/office/`)
  await expect(page.locator('.member-workspace')).toHaveAttribute('data-fixed-scene', 'true')
  for (const size of [{ width: 1440, height: 900 }, { width: 1920, height: 900 }, { width: 1100, height: 1000 }, { width: 1366, height: 650 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size)
    const bounds = await page.locator('.member-scene-frame > .office-main').boundingBox()
    expect(bounds!.width / bounds!.height).toBeCloseTo(1100 / 950, 2)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(size.width)
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(size.height)
    if (size.width > 760) {
      const sidebar = await page.locator('.member-sidebar').boundingBox()
      expect(sidebar!.width).toBeGreaterThanOrEqual(280)
      expect(sidebar!.width).toBeLessThanOrEqual(380)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.getByRole('button', { name: '展开对话', exact: true }).click()
  await expect(page.getByRole('region', { name: '办公室对话', exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: '给办公室发送消息' }).fill('固定比例布局保留聊天草稿')
  await page.getByRole('button', { name: '收起聊天', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '给办公室发送消息' })).toHaveValue('固定比例布局保留聊天草稿')
  await page.goto(`${url}/collaboration/`)
  await expect(page.locator('.office-main-panorama')).toBeVisible()
  await expect(page.locator('.member-scene-frame')).toHaveCount(0)
})

test('rounded layout shows conversation-scoped data, keeps the archive footer visible and accepts remote switching', async ({ page }, testInfo) => {
  const state = office(), review = structuredClone(state.conversations[0])
  review.id = 'review'; review.title = '复盘会话'; review.tasks[0].status = 'completed'; review.whiteboard.title = '独立复盘目标'
  state.conversations.push(review)
  expect((await backend.post({ type: 'offices.initialize', offices: [state], layoutId: 'rounded' })).code).toBe(202)
  await page.goto(`${url}/collaboration/`)
  await expect(page.locator('.rounded-workspace')).toBeVisible()
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30000 })
  const stats = page.getByRole('region', { name: '当前会话办公室统计' })
  await expect(stats.locator('strong').nth(0)).toHaveText('1 / 1')
  await expect(page.locator('.rounded-scene-caption')).toHaveText('研发交付计划')
  await page.getByRole('button', { name: '展开对话', exact: true }).click()
  await page.getByRole('textbox', { name: '给办公室发送消息' }).fill('保留圆角布局草稿')
  await page.getByRole('tab', { name: '复盘会话', exact: true }).click()
  await expect(stats.locator('strong').nth(0)).toHaveText('0 / 1')
  await expect(stats.locator('strong').nth(1)).toHaveText('1')
  await page.getByRole('button', { name: '收起聊天', exact: true }).click()
  await expect(page.locator('.rounded-scene-caption')).toHaveText('独立复盘目标')
  await page.getByRole('button', { name: '查看验收调研员的资料', exact: true }).click()
  await expect(page.locator('.member-profile-heading')).toContainText('验收调研员')
  for (const size of [{ width: 1440, height: 1050 }, { width: 1492, height: 707 }, { width: 390, height: 844 }, { width: 320, height: 700 }]) {
    await page.setViewportSize(size)
    if (size.width < 761) await page.getByRole('button', { name: '展开成员侧栏', exact: true }).click()
    await expect(page.getByRole('button', { name: '查看完整档案', exact: true })).toBeVisible()
    const footer = await page.locator('.member-detail-footer').boundingBox()
    expect(footer!.y + footer!.height).toBeLessThanOrEqual(size.height)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (size.width < 761) {
      await page.keyboard.press('Escape')
      await expect(page.getByRole('button', { name: '展开成员侧栏', exact: true })).toBeFocused()
    }
    await testInfo.attach(`rounded-${size.width}`, { body: await page.screenshot(), contentType: 'image/png' })
  }
  const pixels = await sharp(await page.locator('canvas').screenshot()).stats()
  expect(pixels.channels[0].stdev).toBeGreaterThan(10)
  await page.setViewportSize({ width: 1440, height: 1050 })
  expect((await backend.post({ type: 'office.layout.set', layoutId: 'members' })).code).toBe(200)
  await expect(page.locator('.rounded-workspace')).toHaveCount(0)
  await expect(page.locator('.member-current-task')).toContainText('当前没有关联任务')
  expect((await backend.post({ type: 'office.layout.set', layoutId: 'rounded' })).code).toBe(200)
  await page.getByRole('button', { name: '展开对话', exact: true }).click()
  await page.getByRole('tab', { name: '主会话', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '给办公室发送消息' })).toHaveValue('保留圆角布局草稿')
})

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
