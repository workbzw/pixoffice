import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'

let server
let locale
let content
before(async () => {
  server = await createTestServer()
  locale = await server.ssrLoadModule('/example/office-web/src/website/locale.ts')
  content = await server.ssrLoadModule('/example/office-web/src/website/content.ts')
})
after(async () => { await server?.close() })

test('website language priority is URL, saved choice, browser, then Chinese', () => {
  const { resolveWebsiteLocale: resolve } = locale
  assert.equal(resolve('en', 'zh', ['zh-CN']), 'en')
  assert.equal(resolve('zh', 'en', ['en-US']), 'zh')
  assert.equal(resolve(null, 'en', ['zh-CN']), 'en')
  assert.equal(resolve('invalid', 'invalid', ['fr-FR', 'en-GB', 'zh-CN']), 'en')
  assert.equal(resolve(null, null, ['zh-TW', 'en-US']), 'zh')
  assert.equal(resolve(null, null, ['EN-us']), 'en')
  assert.equal(resolve(null, null, ['fr-FR']), 'zh')
  assert.equal(resolve(null, null, []), 'zh')
})

function flatten(value, prefix = '') {
  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof entry === 'string' ? [[path, entry]] : Object.entries(flatten(entry, path))
  }))
}

function browserGlobal(t, key, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, key)
  Object.defineProperty(globalThis, key, { configurable: true, value })
  t.after(() => {
    if (original) Object.defineProperty(globalThis, key, original)
    else delete globalThis[key]
  })
}

test('both website dictionaries cover the same non-empty strings', () => {
  const zh = flatten(content.websiteContent.zh)
  const en = flatten(content.websiteContent.en)
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort())
  for (const [key, value] of Object.entries(zh)) assert.ok(value.trim(), `Missing Chinese: ${key}`)
  for (const [key, value] of Object.entries(en)) {
    assert.ok(value.trim(), `Missing English: ${key}`)
    assert.doesNotMatch(value, /[\u3400-\u9fff]/u, `Untranslated English: ${key}`)
  }
})

test('GitHub links open the matching README and default to Chinese', () => {
  const root = 'https://github.com/workbzw/pixoffice/blob/main/'
  assert.equal(content.websiteReadme(), `${root}README.md`)
  assert.equal(content.websiteReadme('zh'), `${root}README.md`)
  assert.equal(content.websiteReadme('en'), `${root}README.en.md`)
})

test('homepage starts with scene cards, with civic after farm and a custom scene contact', async () => {
  const source = await readFile(new URL('../example/office-web/src/website/Website.tsx', import.meta.url), 'utf8')
  assert.match(source, /<main id="main">\s*<section id="examples"/)
  assert.doesNotMatch(source, /site-hero|site-overview|site-architecture/)
  assert.match(source, /t\.examples\.farm\.action[\s\S]*?<a className="site-example" href=\{`\$\{base\}civic\/`\}>/)
  assert.match(source, /<article id="customization"/)
  assert.match(source, /<dialog[^>]*aria-labelledby="contact-title" aria-describedby="contact-description"/)
  await access(new URL('../public/site/customization-contact.jpg', import.meta.url))
  assert.equal(content.websiteContent.zh.nav.civic, '公务')
  const entry = await readFile(new URL('../example/office-web/civic/index.html', import.meta.url), 'utf8')
  const main = await readFile(new URL('../example/office-web/src/civic/main.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source + entry + main, /警察|police/i)
  assert.match(entry, /<title>公务 · PixOffice<\/title>/)
  assert.match(main, /公务场景预览/)
})

test('READMEs link to each other, preserve website language, and use existing local assets', async () => {
  for (const [language, filename, other] of [
    ['zh', 'README.md', 'README.en.md'],
    ['en', 'README.en.md', 'README.md'],
  ]) {
    const url = new URL(`../${filename}`, import.meta.url)
    const text = await readFile(url, 'utf8')
    assert.ok(text.startsWith('# PixOffice\n'))
    assert.ok(text.includes(`](./${other})`))
    assert.ok(text.includes(`https://pixoffice.online/?lang=${language}`))
    assert.ok(text.includes('./docs/office-demo.gif'))
    assert.ok(text.includes('./docs/page-preview.jpeg'))
    assert.ok(text.includes('./docs/wechat-qr.png'))
    assert.ok(text.includes('./docs/donate-qr.jpg'))
    assert.ok(text.includes('](./docs/development.md)'))
    assert(text.split('\n').length <= 90, 'keep detailed instructions in linked guides instead of expanding the README')
    for (const anchor of ['demo', 'quick-start', 'docs', 'support']) {
      assert.ok(text.includes(`<a id="${anchor}"></a>`))
      assert(text.indexOf(`](#${anchor})`) >= 0 && text.indexOf(`](#${anchor})`) < text.indexOf('./docs/office-demo.gif'), 'navigation must appear before preview media')
    }
    for (const match of text.matchAll(/\]\((\.\/[^\s)]+)\)/g)) {
      await access(new URL(match[1], url))
    }
    const images = [...text.matchAll(/<img\s+[^>]*src="(\.\/[^\"]+)"[^>]*>/g)]
    assert.equal(images.length, 2, 'contact and donation QR codes must be paired')
    for (const match of images) {
      assert(match[0].includes('width="200"'), 'QR codes must have matching display widths')
      await access(new URL(match[1], url))
    }
    assert(!text.includes('/actions'))
  }
})

test('the maintenance guide preserves moved development instructions and valid links', async () => {
  const url = new URL('../docs/development.md', import.meta.url)
  const text = await readFile(url, 'utf8')
  for (const instruction of ['npm run packages:watch', 'npm run characters:check', 'npm run docs:capture', '--gif-only', 'pixoffice:actions-ready']) {
    assert(text.includes(instruction), instruction)
  }
  for (const match of text.matchAll(/\]\((\.{1,2}\/[^\s)]+)\)/g)) {
    const target = new URL(match[1], url)
    target.hash = ''; target.search = ''
    await access(target)
  }
})

test('translated shell examples preserve protocol fields and escape apostrophes', () => {
  for (const language of ['zh', 'en']) {
    const snippets = content.websiteSnippets(language)
    // A local shell function captures arguments without invoking curl or the gateway.
    const output = execFileSync('/bin/sh', ['-c', `curl() { printf '%s\\0' "$@"; }\n${snippets.action}`], { encoding: 'utf8' })
    const args = output.split('\0').filter(Boolean)
    assert.deepEqual(args.slice(0, 7), ['-X', 'POST', 'http://localhost:8765/api/pixoffice/messages', '-H', 'Authorization: Bearer pixoffice-demo-key', '-H', 'Content-Type: application/json'])
    assert.equal(args[7], '-d')
    assert.equal(args.length, 9)
    const envelope = JSON.parse(args[8])
    assert.deepEqual(Object.keys(envelope).sort(), ['command', 'teamId'])
    assert.equal(envelope.teamId, 'office-1')
    assert.deepEqual(envelope.command, {
      protocolVersion: '2.0', sceneId: 'office-1', commandId: 'visit-example-1',
      type: 'activity.start', capability: 'office.visit',
      participants: [{ entityId: 'office-lead', role: 'visitor' }, { entityId: 'code-agent', role: 'host' }],
      params: { stops: [{ hostId: 'code-agent', message: content.websiteContent[language].code.message }] },
    })
    assert.equal(snippets.start, content.websiteSnippets('zh').start)
  }
})

test('language selection preserves deployment path, query, hash, and history state', t => {
  const href = 'https://example.test/preview/?ref=docs#examples'
  const state = { marker: 1 }
  let saved
  let replacement
  browserGlobal(t, 'location', { href, search: '?ref=docs' })
  browserGlobal(t, 'localStorage', {
    getItem: () => 'en',
    setItem: (key, value) => { saved = [key, value] },
  })
  browserGlobal(t, 'history', {
    state,
    replaceState: (...args) => { replacement = args },
  })
  browserGlobal(t, 'navigator', { languages: ['zh-CN'] })
  assert.equal(locale.readWebsiteLocale(), 'en')
  locale.rememberWebsiteLocale('zh')
  assert.deepEqual(saved, [locale.websiteLocaleKey, 'zh'])
  assert.equal(replacement[0], state)
  assert.equal(replacement[2].href, 'https://example.test/preview/?ref=docs&lang=zh#examples')
})

test('blocked local storage does not prevent choosing a language', t => {
  let replacement
  browserGlobal(t, 'location', { href: 'https://example.test/?lang=en', search: '?lang=en' })
  browserGlobal(t, 'localStorage', {
    getItem: () => { throw new Error('Storage blocked') },
    setItem: () => { throw new Error('Storage blocked') },
  })
  browserGlobal(t, 'history', {
    state: null,
    replaceState: (...args) => { replacement = args },
  })
  browserGlobal(t, 'navigator', { languages: ['zh-CN'] })
  assert.equal(locale.readWebsiteLocale(), 'en')
  assert.doesNotThrow(() => locale.rememberWebsiteLocale('zh'))
  assert.equal(replacement[2].search, '?lang=zh')
})
