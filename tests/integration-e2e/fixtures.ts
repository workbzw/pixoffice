import { test as base, expect } from '@playwright/test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import Fastify from 'fastify'
import serveStatic from '@fastify/static'
import { ExternalClient } from './client.ts'
import type { Page } from '@playwright/test'

const exec = promisify(execFile)
type Service = { id: string; url: string; key: string; restart: () => Promise<void> }
async function availablePort() {
  const listener = createServer()
  await new Promise<void>((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve) })
  const address = listener.address()
  if (!address || typeof address === 'string') throw new Error('Failed to allocate a local port')
  await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()))
  return address.port
}
async function healthy(url: string) {
  await expect.poll(async () => {
    try { return (await fetch(`${url}/health`, { signal: AbortSignal.timeout(1000) })).status }
    catch { return 0 }
  }, { timeout: 30000 }).toBe(200)
}
export const test = base.extend<{ service: Service; backend: ExternalClient; staticDemo: boolean }>({
  staticDemo: [false, { option: true }],
  service: async ({ staticDemo }, provide, testInfo) => {
    if (staticDemo) {
      const app = Fastify()
      try {
        await app.register(serveStatic, { root: process.env.PIXOFFICE_E2E_STATIC_ROOT || fileURLToPath(new URL('../../dist/', import.meta.url)), index: ['index.html'], redirect: true })
        const url = await app.listen({ host: '127.0.0.1', port: 0 })
        await provide({ id: 'static-demo', url, key: '', restart: async () => { throw new Error('The static demo has no integration service to restart') } })
      } finally { await app.close() }
      return
    }
    const image = process.env.PIXOFFICE_E2E_IMAGE
    if (!image) throw new Error('Run npm run test:integration to build and select the test image')
    const key = randomUUID(), name = `pixoffice-e2e-${randomUUID()}`
    // An explicit ephemeral port remains stable across docker restart.
    const port = await availablePort()
    const { stdout } = await exec('docker', ['run', '--rm', '--detach', '--name', name, '--publish', `127.0.0.1:${port}:3000`, '--env', `PIXOFFICE_API_KEY=${key}`, image])
    const id = stdout.trim()
    try {
      const url = `http://127.0.0.1:${port}`
      await healthy(url)
      await provide({ id, url, key, restart: async () => { await exec('docker', ['restart', id]); await healthy(url) } })
    } finally {
      if (testInfo.status !== testInfo.expectedStatus) {
        const logs = await exec('docker', ['logs', id]).catch(error => ({ stdout: String(error), stderr: '' }))
        await testInfo.attach('container.log', { body: `${logs.stdout}\n${logs.stderr}`, contentType: 'text/plain' })
      }
      await exec('docker', ['rm', '--force', id]).catch(() => {})
    }
  },
  backend: async ({ service }, provide, testInfo) => {
    const log = testInfo.outputPath('external-http.jsonl')
    await mkdir(path.dirname(log), { recursive: true })
    await writeFile(log, '')
    await provide(new ExternalClient(service.url, service.key, log))
    await testInfo.attach('external-http', { path: log, contentType: 'application/x-ndjson' })
  },
  page: async ({ page }, provide, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await provide(page)
    await testInfo.attach('browser-errors', { body: JSON.stringify(errors, null, 2), contentType: 'application/json' })
    expect(errors, 'Browser must not throw uncaught errors').toEqual([])
  },
})
export { expect }
export async function openOffice(page: Page, url: string) {
  await page.goto(`${url}/office/`)
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30000 })
  await expect(page.getByText(/正在加载办公室/)).toHaveCount(0, { timeout: 30000 })
  await expect(page.locator('.runtime-footer')).toContainText('消息连接：已连接')
}
export async function selectOffice(page: Page, name: string) {
  await page.getByRole('button', { name: /^团队空间，当前团队/ }).click()
  await page.getByRole('button', { name: `进入${name}`, exact: true }).click()
  await expect(page.getByRole('dialog', { name: '团队空间', exact: true })).toBeHidden()
  await expect(page.getByRole('button', { name: new RegExp(`^团队空间，当前团队：${name}`) })).toBeVisible()
  await expect(page.getByText(/正在加载办公室/)).toHaveCount(0, { timeout: 30000 })
}
