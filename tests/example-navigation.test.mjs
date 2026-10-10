import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer as createHttpServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'

for (const base of ['/', '/preview/']) {
  test(`website and both examples have independent entries under ${base}`, async () => {
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
      const home = await fetch(`${origin}${base}`)
      assert.equal(home.status, 200)
      const homeHtml = await home.text()
      assert.match(homeHtml, /src\/website\/main\.tsx/)
      assert.doesNotMatch(homeHtml, /src="[^"\n]*\/src\/main\.tsx"/)
      assert.ok(homeHtml.includes(`href="${base}office/"`))

      for (const entry of ['office/', 'office/index.html']) {
        const office = await fetch(`${origin}${base}${entry}`)
        assert.equal(office.status, 200)
        const html = await office.text()
        assert.match(html, /id="root"/)
        assert.match(html, /src\/main\.tsx/)
        assert.match(html, /完整办公室 · PixOffice/)
      }

      for (const entry of ['minimal/', 'minimal/index.html']) {
        const response = await fetch(`${origin}${base}${entry}`)
        assert.equal(response.status, 200)
        const html = await response.text()
        assert.ok(html.includes(`href="${base}"`), 'return link stays in the deployment base')
        assert.ok(html.includes(`href="${base}office/"`), 'minimal page links to the full office, not the home page')
        assert.match(html, /id="office"/)
        assert.match(html, /id="visit-form"/)
        assert.ok(html.includes(`href="${base}brand/logo.png"`))
      }

      for (const entry of ['farm/', 'farm/index.html']) {
        const response = await fetch(`${origin}${base}${entry}`)
        assert.equal(response.status, 200)
        const html = await response.text()
        assert.match(html, /PixOffice · 农场/)
        assert.match(html, /src\/farm\.tsx/)
        assert.ok(html.includes(`href="${base}brand/logo.png"`))
      }

      const entry = await readFile(new URL('../example/office-web/src/minimal.ts', import.meta.url), 'utf8')
      assert.match(entry, /minimal-vanilla\/src\/main\.ts/)
      const source = await readFile(new URL('../example/office-web/src/components/RuntimeWorkspace.tsx', import.meta.url), 'utf8')
      assert.match(source, /最小装配/)
      assert.ok(source.includes('href={`${import.meta.env.BASE_URL}minimal/`}'))
      assert.match(source, /官网首页/)
      const website = await readFile(new URL('../example/office-web/src/website/Website.tsx', import.meta.url), 'utf8')
      assert.ok(website.includes('href={`${base}office/`}'))
      assert.ok(website.includes('href={`${base}minimal/`}'))
      assert.doesNotMatch(website, /from ['"](?:@pixoffice\/|pixi\.js)/, 'the home page does not mount an office runtime')
    } finally {
      http.closeAllConnections()
      await new Promise(resolve => http.close(resolve))
      await server.close()
      await rm(cacheDir, { recursive: true, force: true })
    }
  })
}
