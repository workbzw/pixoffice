import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import Fastify from 'fastify'
import serveStatic from '@fastify/static'
import { chromium, expect } from '@playwright/test'
import sharp from 'sharp'

const root = fileURLToPath(new URL('../', import.meta.url)), exec = promisify(execFile)
const gifOnly = process.argv.includes('--gif-only'), durationMs = 6000, fps = 25
const viewport = { width: 1600, height: 1200 }, output = { width: 1100, height: 850 }
await exec('ffmpeg', ['-version'])
const directory = await mkdtemp(path.join(tmpdir(), 'pixoffice-readme-')), app = Fastify()
let browser
try {
  await app.register(serveStatic, { root: path.join(root, 'dist'), index: ['index.html'], redirect: true })
  const url = await app.listen({ host: '127.0.0.1', port: 0 })
  browser = await chromium.launch({ channel: process.env.PIXOFFICE_CAPTURE_BROWSER_CHANNEL || 'chrome', headless: true })
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, locale: 'zh-CN' })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${url}/office/`)
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30000 })
  await expect(page.getByText(/正在加载办公室/)).toHaveCount(0, { timeout: 30000 })
  await expect(page.locator('.runtime-footer')).toContainText('本地示例')

  // Complete the local preview menus using ordinary UI actions before recording the scene.
  const panel = page.getByRole('complementary', { name: '待你决定', exact: true })
  await panel.getByRole('radio').first().check()
  await panel.getByRole('button', { name: '提交选择', exact: true }).click()
  await panel.getByRole('button', { name: '暂不提交', exact: true }).click()
  await expect(panel).toBeHidden({ timeout: 10000 })
  while (await page.getByRole('button', { name: /^暂不提醒/ }).count()) await page.getByRole('button', { name: /^暂不提醒/ }).first().click()
  const start = page.getByRole('button', { name: '开始演示', exact: true })
  await expect(start).toBeEnabled({ timeout: 30000 })
  await start.click()
  await expect(page.getByRole('button', { name: '停止演示', exact: true })).toBeVisible()
  await page.mouse.move(viewport.width - 1, viewport.height - 1)

  await page.waitForTimeout(2000)
  const bounds = await page.locator('canvas').boundingBox()
  assert(bounds, 'The office canvas must have visible bounds')
  const sceneScale = Math.min(bounds.width / output.width, bounds.height / output.height)
  const sceneBounds = { x: bounds.x + (bounds.width - output.width * sceneScale) / 2,
    y: bounds.y + (bounds.height - output.height * sceneScale) / 2, width: output.width * sceneScale, height: output.height * sceneScale }
  const frames = [], writes = [], hashes = new Set(), session = await page.context().newCDPSession(page)
  let recording = true
  session.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    writes.push(session.send('Page.screencastFrameAck', { sessionId }))
    if (!recording) return
    const name = `frame-${String(frames.length).padStart(4, '0')}.jpg`, bytes = Buffer.from(data, 'base64')
    frames.push({ name, at: metadata.timestamp * 1000 })
    hashes.add(createHash('sha256').update(bytes).digest('hex'))
    writes.push(writeFile(path.join(directory, name), bytes))
  })
  // Continuous browser capture avoids a synchronous screenshot on every animation frame.
  await session.send('Page.startScreencast', { format: 'jpeg', quality: 96, maxWidth: viewport.width, maxHeight: viewport.height, everyNthFrame: 1 })
  await page.waitForTimeout(durationMs)
  recording = false
  await session.send('Page.stopScreencast')
  await Promise.all(writes)
  assert(frames.length >= 2, 'No continuous browser frames were captured')
  const capturedFps = (frames.length - 1) * 1000 / (frames.at(-1).at - frames[0].at)
  assert(capturedFps >= fps && hashes.size >= 120, `Capture is too slow: ${capturedFps.toFixed(1)} fps, ${hashes.size} distinct frames`)
  assert.deepEqual(errors, [], 'The browser must not throw errors while recording')
  await expect(page.locator('.runtime-scene-notice')).toHaveCount(0)
  const canvas = await sharp(await page.locator('canvas').screenshot()).stats()
  assert(canvas.channels[0].stdev > 10, 'The recorded scene must not be blank')
  // Preserve the timestamps of real captured frames; do not invent motion between them.
  const manifest = frames.map((frame, index) => `file '${frame.name}'\nduration ${Math.max(1, (frames[index + 1]?.at ?? frame.at + 1000 / fps) - frame.at) / 1000}`).join('\n')
  await writeFile(path.join(directory, 'frames.txt'), `${manifest}\nfile '${frames.at(-1).name}'\n`)
  const frame = await sharp(path.join(directory, frames[0].name)).metadata()
  const crop = { x: Math.round(sceneBounds.x * frame.width / viewport.width), y: Math.round(sceneBounds.y * frame.height / viewport.height),
    width: Math.round(sceneBounds.width * frame.width / viewport.width), height: Math.round(sceneBounds.height * frame.height / viewport.height) }
  await exec('ffmpeg', ['-hide_banner', '-loglevel', 'warning', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(directory, 'frames.txt'),
    '-filter_complex', `[0:v]crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},fps=${fps},scale=${output.width}:${output.height}:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle`,
    '-t', String(durationMs / 1000), '-loop', '0', path.join(root, 'docs/office-demo.gif')])
  if (!gifOnly) {
    await session.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 2, mobile: false })
    await expect.poll(() => page.locator('canvas').evaluate(canvas => canvas.width / canvas.getBoundingClientRect().width)).toBeCloseTo(2, 1)
    await page.screenshot({ path: path.join(root, 'docs/page-preview.jpeg'), type: 'jpeg', quality: 94 })
  }
  const image = await sharp(path.join(root, 'docs/page-preview.jpeg')).metadata()
  const animation = await sharp(path.join(root, 'docs/office-demo.gif'), { animated: true }).metadata()
  assert.equal(image.width, 3200); assert.equal(image.height, 2000)
  assert.equal(animation.width, output.width); assert.equal(animation.pageHeight, output.height); assert(animation.pages > 100)
  console.log(JSON.stringify({ capturedFrames: frames.length, distinctFrames: hashes.size, capturedFps: Number(capturedFps.toFixed(1)), gifFrames: animation.pages,
    durationSeconds: animation.delay.reduce((sum, value) => sum + value, 0) / 1000, screenshot: gifOnly ? 'preserved' : '3200x2000',
    animation: `${output.width}x${output.height}`, framing: 'office scene', browserErrors: errors }))
} finally {
  if (browser) await browser.close()
  await app.close()
  await rm(directory, { recursive: true, force: true })
}
