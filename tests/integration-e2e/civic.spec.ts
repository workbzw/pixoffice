import { test, expect } from '@playwright/test'
import sharp from 'sharp'
import { createPixOfficeServer, defaultStaticRoot } from '../../server/src/app.ts'

let app: Awaited<ReturnType<typeof createPixOfficeServer>>, url: string, errors: string[] = []
test.beforeEach(async ({ page }) => {
  errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`) })
  app = await createPixOfficeServer({ staticRoot: process.env.PIXOFFICE_E2E_STATIC_ROOT || defaultStaticRoot })
  url = await app.listen({ host: '127.0.0.1', port: 0 })
  await page.route('**/pixoffice-config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'globalThis.__PIXOFFICE_CONFIG__ = {};' }))
})
test.afterEach(async () => { await app?.close(); expect(errors).toEqual([]) })

test('homepage places civic after farm in both languages and fits narrow screens', async ({ page }, testInfo) => {
  for (const locale of ['zh', 'en']) {
    await page.goto(`${url}/?lang=${locale}`)
    await expect(page.locator('.site-example')).toHaveCount(6)
    expect(await page.locator('.site-example').evaluateAll(nodes => nodes.map(node => new URL((node as HTMLAnchorElement).href).pathname)))
      .toEqual(['/office/', '/classroom/', '/minimal/', '/farm/', '/civic/', '/collaboration/'])
    await expect(page.locator('main > section').first()).toHaveAttribute('id', 'examples')
    await expect(page.locator('#customization')).toHaveCount(1)
    for (const width of [1440, 1281, 1100, 800, 640, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      const firstCard = await page.locator('.site-example').first().boundingBox()
      expect(firstCard!.y).toBeLessThan(900 / 3)
      expect(firstCard!.y + firstCard!.height).toBeLessThan(900)
      const columns = await page.locator('.site-example-grid').evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length)
      expect(columns).toBe(width > 1050 ? 3 : width > 600 ? 2 : 1)
      const menu = page.locator('.site-menu-toggle')
      if (!await menu.isVisible()) {
        const bounds = await page.locator('.site-brand, .site-nav, .site-header-tools').evaluateAll(nodes => nodes.slice(0, 3).map(node => {
          const rect = node.getBoundingClientRect(); return { left: rect.left, right: rect.right }
        }))
        expect(bounds[0].right).toBeLessThanOrEqual(bounds[1].left)
        expect(bounds[1].right).toBeLessThanOrEqual(bounds[2].left)
      }
      await testInfo.attach(`homepage-${locale}-${width}`, { body: await page.screenshot(), contentType: 'image/png' })
    }
  }
})

test('published collaboration entry defaults to rounded and keeps all three layout choices', async ({ page }, testInfo) => {
  await page.goto(`${url}/?lang=zh`)
  await page.locator('.site-example[href="/collaboration/"]').click()
  await expect(page).toHaveURL(/\/collaboration\/\?shell=rounded$/)
  await expect(page.locator('.rounded-workspace')).toBeVisible()
  await expect(page.locator('.office-main-panorama')).toBeVisible()
  await expect(page.locator('.office-loading')).toHaveCount(0, { timeout: 30000 })
  const pixels = await sharp(await page.locator('canvas').screenshot()).stats()
  expect(pixels.channels[0].stdev).toBeGreaterThan(10)
  for (const [label, selector] of [['经典布局', '.runtime-workspace'], ['成员布局', '.member-workspace:not(.rounded-workspace)'], ['圆角布局', '.rounded-workspace']]) {
    await page.getByRole('button', { name: '切换页面布局', exact: true }).click()
    await page.getByRole('button', { name: label, exact: true }).click()
    await expect(page.locator(selector)).toBeVisible()
    await expect(page.locator('canvas')).toHaveCount(1)
    await expect(page.locator('.office-main-panorama')).toBeVisible()
  }
  for (const size of [{ width: 1920, height: 1080 }, { width: 1492, height: 707 }, { width: 1000, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size)
    await expect.poll(() => page.locator('canvas').evaluate(node => Math.abs((node as HTMLCanvasElement).width - node.clientWidth * devicePixelRatio) < 3)).toBe(true)
    const canvas = await page.locator('canvas').boundingBox(), main = await page.locator('.office-main-panorama').boundingBox()
    const stats = await page.locator('.rounded-office-stats').boundingBox()
    expect(Math.abs(main!.width - stats!.width)).toBeLessThan(2)
    expect(Math.abs(canvas!.height - main!.height)).toBeLessThan(2)
    expect(Math.abs(canvas!.y - main!.y)).toBeLessThan(2)
    const scale = Math.min(canvas!.width / 1600, canvas!.height / 950)
    expect(main!.y + main!.height).toBeCloseTo(size.height - (size.width <= 760 ? 10 : size.height <= 740 ? 12 : size.width <= 1100 ? 14 : 20), 0)
    if (size.width > 1100) {
      const caption = await page.locator('.rounded-scene-caption').boundingBox()
      const boardLeft = canvas!.x + (canvas!.width - 1100 * scale) / 2 + 100 * scale
      expect(caption!.x + caption!.width).toBeLessThan(boardLeft)
    }
    const screenshot = await page.locator('canvas').screenshot(), metadata = await sharp(screenshot).metadata()
    for (const top of [12, metadata.height! - 24]) {
      const edge = await sharp(screenshot).extract({ left: Math.round(metadata.width! / 2), top, width: 8, height: 8 }).stats()
      expect(edge.channels.slice(0, 3).reduce((sum, channel) => sum + channel.mean, 0) / 3).toBeLessThan(253)
    }
    const pixelScale = scale * metadata.width! / canvas!.width
    // Sample the inner window pane, clear of the mobile toolbar and the larger board.
    const { data, info } = await sharp(screenshot).extract({
      left: Math.floor(metadata.width! - 310 * pixelScale), top: Math.floor(120 * pixelScale),
      width: Math.floor(70 * pixelScale), height: Math.floor(180 * pixelScale),
    }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    let skyPixels = 0
    for (let offset = 0; offset < data.length; offset += info.channels) {
      if (data[offset + 2] > data[offset] + 12 && data[offset + 2] > 180) skyPixels++
    }
    expect(skyPixels / (info.width * info.height), 'blue sky remains inside the right-hand window').toBeGreaterThan(.08)
    await testInfo.attach(`panorama-${size.width}`, { body: await page.screenshot(), contentType: 'image/png' })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const frame = await page.locator('.member-scene-area').boundingBox()
  expect(frame!.y + frame!.height).toBeCloseTo(834, 0)
  const toolbar = await page.locator('.runtime-scene-toolbar').boundingBox()
  expect(toolbar!.y).toBeLessThan(frame!.y + 30)
  expect(toolbar!.width).toBeLessThan(40)
  const canvas = await page.locator('canvas').boundingBox()
  const scale = Math.min(canvas!.width / 1600, canvas!.height / 950)
  await page.mouse.click(canvas!.x + canvas!.width / 2, canvas!.y + 140 * scale)
  await expect(page.getByRole('dialog', { name: '协作白板', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '关闭白板', exact: true }).click()
  await page.getByRole('button', { name: '展开对话', exact: true }).click()
  await expect.poll(async () => (await page.locator('.office-chat[data-expanded=true]').boundingBox())!.height).toBeGreaterThan(500)
  await page.getByRole('button', { name: '收起聊天', exact: true }).click()
  await testInfo.attach('collaboration-mobile', { body: await page.screenshot(), contentType: 'image/png' })
})

test('custom scene QR opens, closes and restores focus on desktop and mobile', async ({ page }, testInfo) => {
  for (const locale of ['zh', 'en']) {
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      await page.goto(`${url}/?lang=${locale}`)
      const trigger = page.locator('.site-qr-button')
      await trigger.click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      const image = dialog.locator('.site-contact-qr')
      await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(638)
      const bounds = await dialog.boundingBox()
      expect(bounds!.x).toBeGreaterThanOrEqual(16)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width - 16)
      expect(bounds!.y).toBeGreaterThanOrEqual(16)
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(828)
      await expect(dialog.locator('button')).toBeFocused()
      expect(await dialog.evaluate(node => node.matches(':modal'))).toBe(true)
      await testInfo.attach(`contact-${locale}-${width}`, { body: await page.screenshot(), contentType: 'image/png' })
      await page.keyboard.press('Escape')
      await expect(dialog).not.toBeVisible()
      await expect(trigger).toBeFocused()
      await page.locator('#customization .site-text-link').click()
      await dialog.locator('button').click()
      await expect(dialog).not.toBeVisible()
      if (width <= 760) await page.locator('.site-menu-toggle').click()
      await page.locator('#site-navigation > button').click()
      await expect(dialog).toBeVisible()
      await page.mouse.click(4, 4)
      await expect(dialog).not.toBeVisible()
      if (width <= 760) await expect(page.locator('.site-menu-toggle')).toBeFocused()
    }
  }
})

test('published civic entry loads uniform characters in members and can switch to classic', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('pixoffice.page-shell.v1', 'classic'))
  await page.goto(`${url}/`)
  await page.locator('.site-example[href="/civic/"]').click()
  await expect(page).toHaveURL(/\/civic\/\?shell=members$/)
  await expect(page).toHaveTitle('公务 · PixOffice')
  await expect(page.getByLabel('办公室成员', { exact: true })).toBeVisible()
  await expect(page.getByText('公务场景预览 · 人物动作素材尚未验收', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '开始演示', exact: true })).toBeEnabled({ timeout: 30000 })
  await expect.poll(() => page.locator('img[src*="/civic-assets/"]').evaluateAll(nodes => nodes.length >= 6 && nodes.every(node => {
    const img = node as HTMLImageElement; return img.complete && img.naturalWidth > 0
  }))).toBe(true)
  expect(await page.locator('body').innerText()).not.toContain('警察')
  expect((await sharp(await page.locator('canvas').screenshot()).stats()).channels[0].stdev).toBeGreaterThan(10)
  await testInfo.attach('civic-members', { body: await page.screenshot(), contentType: 'image/png' })
  await page.getByRole('button', { name: '切换页面布局', exact: true }).click()
  await page.getByRole('button', { name: '经典布局', exact: true }).click()
  await expect(page).toHaveURL(/shell=classic/)
  await expect(page.getByLabel('办公室成员', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '切换页面布局', exact: true }).click()
  await page.getByRole('button', { name: '成员布局', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const notice = await page.locator('.civic-preview-status').boundingBox()
  const composer = await page.getByRole('form', { name: '发送消息', exact: true }).boundingBox()
  expect(notice!.y + notice!.height).toBeLessThanOrEqual(composer!.y)
  expect((await sharp(await page.locator('canvas').screenshot()).stats()).channels[0].stdev).toBeGreaterThan(10)
  await testInfo.attach('civic-mobile', { body: await page.screenshot(), contentType: 'image/png' })
})

test('civic story keeps profiles, conversations, decisions and completed task progress in the public-service domain', async ({ page }, testInfo) => {
  test.setTimeout(120000)
  page.setDefaultTimeout(10000)
  const foreign = /电商|商品|支架|销量|售价|投放|市场分析|警察/
  await page.goto(`${url}/civic/?shell=members`)
  const start = page.getByRole('button', { name: '开始演示', exact: true })
  await expect(start).toBeEnabled({ timeout: 30000 })
  const people = [['王明', '综合协调负责人'], ['李研', '诉求受理'], ['周理', '资料核验'], ['陈书', '通知联络'], ['刘市', '现场保障'], ['赵审', '复核归档']]
  for (const [name, role] of people) {
    await page.getByRole('button', { name: `查看${name}的资料`, exact: true }).click()
    await expect(page.locator('.member-profile-role')).toHaveText(role)
    await expect(page.locator('.member-current-task')).toContainText(/服务|材料|通知|现场|方案/)
    expect(await page.locator('.member-detail').innerText()).not.toMatch(foreign)
  }
  await page.getByRole('button', { name: '查看完整档案', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('复核方案与通知')
  expect(await page.getByRole('dialog').innerText()).not.toMatch(foreign)
  await page.getByRole('button', { name: '关闭成员窗口', exact: true }).click()
  await page.getByRole('button', { name: '选择演示类型', exact: true }).click()
  await expect(page.getByRole('menuitemradio', { name: '公务保障', exact: true })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('menuitemradio', { name: '电商流程', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '查看王明的资料', exact: true }).click()
  await start.click()
  const approval = page.getByRole('button', { name: '确认启动', exact: true })
  await expect(approval).toBeVisible({ timeout: 60000 })
  await expect(page.locator('.office-decision-card')).toContainText('便民服务保障')
  await expect(page.getByRole('progressbar', { name: '选择剩余时间' })).toBeVisible()
  expect(await page.locator('body').innerText()).not.toMatch(foreign)
  await testInfo.attach('civic-service-approval', { body: await page.screenshot(), contentType: 'image/png' })
  await page.getByRole('button', { name: '收起待决定面板', exact: true }).click()
  await testInfo.attach('civic-service-preview', { body: await page.screenshot(), contentType: 'image/png' })
  await page.locator('.office-decision-pending').click()
  await approval.click()
  const background = page.getByRole('region', { name: '公务材料复核组待决定提示', exact: true })
  await expect(background).toBeVisible({ timeout: 15000 })
  await expect(background).toContainText('现场等候较长')
  await testInfo.attach('civic-service-adjustment', { body: await page.screenshot(), contentType: 'image/png' })
  await background.getByRole('radio', { name: /增加材料预检与现场引导/ }).check()
  await background.getByRole('button', { name: '提交选择', exact: true }).click()
  await page.getByRole('button', { name: '查看周理的资料', exact: true }).click()
  await expect(page.locator('.member-current-task')).toContainText('汇总服务情况并归档')
  await expect(page.locator('.member-current-task')).toContainText('进行中', { timeout: 40000 })
  await expect(start).toBeVisible({ timeout: 40000 })
  await page.getByRole('button', { name: '查看陈书的资料', exact: true }).click()
  await expect(page.locator('.member-current-task')).toContainText('补充材料预检与现场引导')
  await expect(page.locator('.member-current-task')).toContainText('100%')
  await expect(page.locator('.member-recent-events')).toContainText('已完成')
  await page.getByRole('button', { name: '展开对话', exact: true }).click()
  await expect(page.getByRole('tab', { name: /社区便民服务日保障/ })).toBeVisible()
  await expect(page.getByRole('tab', { name: /服务材料与通知/ })).toBeVisible()
  await expect(page.getByRole('tab', { name: /服务复盘与归档/ })).toBeVisible()
  await expect(page.getByText('便民服务保障复盘', { exact: true })).toBeVisible()
  expect(await page.locator('body').innerText()).not.toMatch(foreign)
  await testInfo.attach('civic-service-completed-chat', { body: await page.screenshot(), contentType: 'image/png' })
  await page.getByRole('button', { name: '收起聊天', exact: true }).click()
  await page.getByRole('button', { name: '切换页面布局', exact: true }).click()
  await page.getByRole('button', { name: '经典布局', exact: true }).click()
  expect(await page.locator('body').innerText()).not.toMatch(foreign)
  await expect(page.locator('body')).toContainText('社区便民服务日保障')
  await testInfo.attach('civic-service-classic', { body: await page.screenshot(), contentType: 'image/png' })
})
