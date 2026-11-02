import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import sharp from 'sharp'
import { createTestServer } from './helpers/vite.mjs'

let server, SponsorCredit
before(async () => {
  server = await createTestServer()
  ;({ SponsorCredit } = await server.ssrLoadModule('/example/office-web/src/components/SponsorCredit.tsx'))
})
after(() => server?.close())

test('sponsor credit distinguishes sponsorship from product branding and does not invent a destination', () => {
  for (const [locale, label] of [['zh', '赞助支持'], ['en', 'Sponsored by']]) {
    const html = renderToStaticMarkup(createElement(SponsorCredit, { locale }))
    assert(html.includes(label))
    assert.match(html, /alt="KunlunMeta"/)
    assert.match(html, /brand\/kunlunmeta\.png/)
    assert.match(html, /width="2593" height="534"/)
    assert.doesNotMatch(html, /<a\b|<button\b|Powered by|filter:|opacity:/)
  }
})

test('all office layouts retain the PixOffice identity and show exactly one sponsor credit', async () => {
  const props = { connection: 'test', dashboard: null, dashboardError: null, sceneLinkError: null, dataMode: 'example',
    executeAction: async () => {}, pendingTaskIds: [], actionError: null, appearanceIds: {}, scene: 'scene', editing: false,
    canRecoverLayout: false, recoverLayout() {}, exportCapabilities() {}, exportSnapshot() {}, renderScenePanel() {} }
  for (const name of ['OfficeShell', 'MemberOfficeShell', 'RoundedOfficeShell']) {
    const module = await server.ssrLoadModule(`/example/office-web/src/ui/${name}.tsx`)
    const html = renderToStaticMarkup(createElement(module[name], props))
    assert.match(html, /alt="PixOffice(?: 官网)?"/)
    assert.equal((html.match(/alt="KunlunMeta"/g) ?? []).length, 1)
    assert.match(html, /sponsor-credit-compact/)
  }
})

test('the sponsor asset preserves its full aspect ratio and transparency', async () => {
  const image = sharp(new URL('../public/brand/kunlunmeta.png', import.meta.url).pathname)
  const metadata = await image.metadata(), stats = await image.stats()
  assert.equal(metadata.width, 2593); assert.equal(metadata.height, 534)
  assert.equal(stats.isOpaque, false)
})
