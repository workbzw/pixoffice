import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer as createHttpServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'

for (const base of ['/', '/preview/']) {
  test(`full office serves the shared minimal entry under ${base}`, async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), 'pixoffice-navigation-'))
    const server = await createServer({
      configFile: fileURLToPath(new URL('../example/office-web/vite.config.ts', import.meta.url)),
      base,
      cacheDir,
      logLevel: 'silent',
      server: { middlewareMode: true, hmr: false, ws: false, watch: null, preTransformRequests: false },
      optimizeDeps: { noDiscovery: true, include: [] },
    })
    const http = createHttpServer(server.middlewares)
    try {
      await new Promise(resolve => http.listen(0, '127.0.0.1', resolve))
      const origin = `http://127.0.0.1:${http.address().port}`
      const office = await fetch(`${origin}${base}`)
      assert.equal(office.status, 200)
      assert.match(await office.text(), /id="root"/)

      for (const entry of ['minimal/', 'minimal/index.html']) {
        const response = await fetch(`${origin}${base}${entry}`)
        assert.equal(response.status, 200)
        const html = await response.text()
        assert.ok(html.includes(`href="${base}"`), 'return link stays in the deployment base')
        assert.match(html, /id="office"/)
        assert.match(html, /id="visit-form"/)
        assert.ok(html.includes(`href="${base}brand/logo.png"`))
      }

      const entry = await readFile(new URL('../example/office-web/src/minimal.ts', import.meta.url), 'utf8')
      assert.match(entry, /minimal-vanilla\/src\/main\.ts/)
      const source = await readFile(new URL('../example/office-web/src/components/RuntimeWorkspace.tsx', import.meta.url), 'utf8')
      assert.match(source, /最小装配/)
      assert.ok(source.includes('href={`${import.meta.env.BASE_URL}minimal/`}'))
    } finally {
      http.closeAllConnections()
      await new Promise(resolve => http.close(resolve))
      await server.close()
      await rm(cacheDir, { recursive: true, force: true })
    }
  })
}
