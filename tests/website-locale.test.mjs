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
    assert.ok(text.includes('./docs/wechat-qr.png'))
    for (const match of text.matchAll(/\]\((\.\/[^\s)]+)\)/g)) {
      await access(new URL(match[1], url))
    }
    const examples = [...text.matchAll(/```json\n([\s\S]*?)\n```/g)].map(match => JSON.parse(match[1]))
    assert.deepEqual(examples.map(example => example.type), ['desk_visit', 'desk_visit_tour', 'set_state'])
  }
})

test('translated shell examples preserve protocol fields and escape apostrophes', () => {
  for (const language of ['zh', 'en']) {
    const snippets = content.websiteSnippets(language)
    // A local shell function captures arguments without invoking curl or the gateway.
    const output = execFileSync('/bin/sh', ['-c', `curl() { printf '%s\\0' "$@"; }\n${snippets.action}`], { encoding: 'utf8' })
    const args = output.split('\0').filter(Boolean)
    assert.deepEqual(args.slice(0, 5), ['-X', 'POST', 'http://localhost:8765/actions', '-H', 'Content-Type: application/json'])
    assert.equal(args[5], '-d')
    assert.equal(args.length, 7)
    assert.deepEqual(JSON.parse(args[6]), {
      type: 'desk_visit', visitor: 1, host: 2,
      message: content.websiteContent[language].code.message,
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
