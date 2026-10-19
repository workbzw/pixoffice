import sharp from 'sharp'
import { test, expect } from './fixtures.ts'

test.describe('static office work effect', () => {
  test.use({ staticDemo: true })

  for (const mobile of [false, true]) test(`working workstations stay framed and animate (${mobile ? 'mobile' : 'desktop'})`, async ({ page, service }, testInfo) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 })
    await page.clock.install()
    await page.goto(`${service.url}/office/`)
    await expect(page.getByRole('button', { name: '开始演示', exact: true })).toBeEnabled({ timeout: 30000 })
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()
    await page.clock.runFor(500)
    const first = await canvas.screenshot()
    await page.clock.runFor(400)
    const second = await canvas.screenshot()
    const { width, height } = await sharp(first).metadata()
    const scale = Math.min(width! / 1100, height! / 850)
    const offset = { x: (width! - 1100 * scale) / 2, y: (height! - 850 * scale) / 2 }
    for (const [name, x, y] of [['frontend', 615, 198], ['backend', 265, 348]] as const) {
      const area = { left: Math.round(offset.x + x * scale), top: Math.round(offset.y + y * scale), width: Math.round(180 * scale), height: Math.round(160 * scale) }
      const before = await sharp(first).extract(area).raw().toBuffer()
      const after = await sharp(second).extract(area).raw().toBuffer()
      const difference = before.reduce((total, value, i) => total + Math.abs(value - after[i]), 0) / before.length
      expect(difference, `${name}: working desks must animate independently`).toBeGreaterThan(.2)
      const crop = await sharp(second).extract(area).resize({ width: 680 }).png().toBuffer()
      await testInfo.attach(`working-desk-${name}`, { body: crop, contentType: 'image/png' })
    }
    expect((await sharp(second).stats()).channels[0].stdev).toBeGreaterThan(10)
    await testInfo.attach('office-frame', { body: await page.screenshot(), contentType: 'image/png' })
  })
})
