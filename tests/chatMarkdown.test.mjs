import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTestServer } from './helpers/vite.mjs'

let server, ChatMarkdown
before(async () => {
  server = await createTestServer()
  ;({ ChatMarkdown } = await server.ssrLoadModule('/example/office-web/src/components/ChatMarkdown.tsx'))
})
after(() => server?.close())

const render = (content, pending = false) => renderToStaticMarkup(createElement(ChatMarkdown, { content, pending }))

test('chat renders Markdown headings, emphasis, lists, quotes and code', () => {
  const html = render('# Plan\n\n**Build** with *care* and `npm test`.\n\n1. Implement\n2. Verify\n\n- Ship\n\n> Keep it simple\n\n```js\nconst tag = "<script>"\n```')
  assert.match(html, /<h1>Plan<\/h1>/)
  assert.match(html, /<strong>Build<\/strong>/)
  assert.match(html, /<em>care<\/em>/)
  assert.match(html, /<code>npm test<\/code>/)
  assert.match(html, /<ol>[\s\S]*<li>Implement<\/li>/)
  assert.match(html, /<ul>[\s\S]*<li>Ship<\/li>/)
  assert.match(html, /<blockquote>/)
  assert.match(html, /<pre><code class="language-js">const tag = &quot;&lt;script&gt;&quot;/)
})

test('chat supports GFM tables, task lists, strikethrough and safe links', () => {
  const html = render('| Task | Status |\n| --- | --- |\n| Build | Done |\n\n- [x] Ready\n- [ ] Waiting\n\n~~Old~~ [Docs](https://example.com/docs)')
  assert.match(html, /class="office-chat-table" role="region" aria-label="表格" tabindex="0"><table>/)
  assert.match(html, /<th>Task<\/th>/)
  assert.match(html, /<td>Done<\/td>/)
  assert.match(html, /type="checkbox" disabled="" checked=""/)
  assert.match(html, /<del>Old<\/del>/)
  assert.match(html, /href="https:\/\/example.com\/docs" target="_blank" rel="noopener noreferrer"/)
})

test('chat cannot execute raw HTML or unsafe link and image URLs', () => {
  const html = render('<script>alert(1)</script>\n\n<iframe src="https://example.com"></iframe>\n\n<img src=x onerror=alert(1)>\n\n[bad](javascript:alert%281%29)\n\n![bad](javascript:alert%281%29)\n\n![data](data:image/svg+xml;base64,PHN2Zz4=)')
  assert.doesNotMatch(html, /<script|<iframe|<img|onerror|javascript:|data:image/i)
  assert.match(html, />bad<\/a>/)
})

test('streaming parses incomplete Markdown safely and removes its caret on completion', () => {
  const content = '## Working\n\n**Partial\n\n```ts\nconst value = "<tag>"'
  const partial = render(content, true)
  assert.match(partial, /<h2>Working<\/h2>/)
  assert.match(partial, /class="language-ts"/)
  assert.match(partial, /&lt;tag&gt;/)
  assert.match(partial, /class="office-chat-caret"/)
  const complete = render(`${content}\n\x60\x60\x60\n\n**Done**`)
  assert.match(complete, /<strong>Done<\/strong>/)
  assert.doesNotMatch(complete, /office-chat-caret/)
})
