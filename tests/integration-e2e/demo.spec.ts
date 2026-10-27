import { test, expect } from '@playwright/test'
import sharp from 'sharp'
import { createPixOfficeServer, defaultStaticRoot } from '../../server/src/app.ts'

let app: Awaited<ReturnType<typeof createPixOfficeServer>>, url: string, errors: string[]
test.beforeEach(async ({ page }) => {
  errors = []
  page.on('pageerror', error => errors.push(error.message))
  app = await createPixOfficeServer({ staticRoot: process.env.PIXOFFICE_E2E_STATIC_ROOT || defaultStaticRoot })
  url = await app.listen({ host: '127.0.0.1', port: 0 })
  // Match static-host demo configuration; the scene and artwork remain real production assets.
  await page.route('**/pixoffice-config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'globalThis.__PIXOFFICE_CONFIG__ = {};' }))
})
test.afterEach(async () => { await app.close(); expect(errors).toEqual([]) })

for (const layout of ['classic', 'members'] as const) test(`all-member demo starts, switches layouts, stops and fits mobile (${layout})`, async ({ page }, testInfo) => {
  await page.goto(`${url}/office/?shell=${layout}`)
  const picker = page.getByRole('button', { name: '选择演示类型', exact: true })
  await expect(picker).toBeEnabled({ timeout: 30000 })
  await picker.click()
  await expect(page.getByRole('menuitemradio', { name: '电商流程', exact: true })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('menuitemradio', { name: '全员动作', exact: true }).click()
  await expect(picker).toHaveAttribute('title', '演示类型：全员动作')
  await page.getByRole('button', { name: '开始演示', exact: true }).click()
  const status = page.locator('.runtime-demo-status')
  await expect(status).toContainText('全员入座工作')
  await expect(status).toContainText('全员挥手', { timeout: 30000 })
  expect((await sharp(await page.locator('canvas').screenshot()).stats()).channels[0].stdev).toBeGreaterThan(10)
  await expect(page.getByRole('complementary', { name: '待你决定' })).toHaveCount(0)
  await testInfo.attach(`all-actions-${layout}`, { body: await page.screenshot(), contentType: 'image/png' })
  await expect(status).toContainText('全员闲时', { timeout: 20000 })
  await page.getByRole('button', { name: '切换页面布局', exact: true }).click()
  await page.getByRole('button', { name: layout === 'classic' ? '成员布局' : '经典布局', exact: true }).click()
  await expect(picker).toHaveAttribute('title', '演示类型：全员动作')
  await expect(page.getByRole('button', { name: '停止演示', exact: true })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await picker.click()
  const menu = page.getByRole('menu', { name: '演示类型', exact: true })
  await expect(menu).toBeVisible()
  const bounds = await menu.boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391)
  await testInfo.attach(`all-actions-mobile-${layout}`, { body: await page.screenshot(), contentType: 'image/png' })
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await page.getByRole('button', { name: '停止演示', exact: true }).click()
  await expect(page.getByRole('button', { name: '开始演示', exact: true })).toBeVisible()
  await picker.click()
  await page.getByRole('menuitemradio', { name: '电商流程', exact: true }).click()
  await page.getByRole('button', { name: '开始演示', exact: true }).click()
  await expect(page.getByRole('button', { name: '停止演示', exact: true })).toBeVisible()
  await expect(status).toHaveCount(0)
  await page.getByRole('button', { name: '停止演示', exact: true }).click()
})
