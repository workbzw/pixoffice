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
    await expect(page.locator('.site-example')).toHaveCount(5)
    expect(await page.locator('.site-example').evaluateAll(nodes => nodes.map(node => new URL((node as HTMLAnchorElement).href).pathname)))
      .toEqual(['/office/', '/classroom/', '/minimal/', '/farm/', '/civic/'])
    const nav = page.locator('#site-navigation a')
    expect((await nav.evaluateAll(nodes => nodes.map(node => new URL((node as HTMLAnchorElement).href).pathname))).slice(4, 6))
      .toEqual(['/farm/', '/civic/'])
    for (const width of [1440, 1281, 1100, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
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
