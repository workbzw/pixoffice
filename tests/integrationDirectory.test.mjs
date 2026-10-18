import assert from 'node:assert/strict'
import { access, readFile, readdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = new URL('../', import.meta.url)
const integration = new URL('integration/', root)

test('integration commands run the standalone clients from the dedicated directory', async () => {
  const { scripts } = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
  for (const [command, filename] of [['integration-example', 'client.mjs'], ['integration-ui-example', 'ui-client.mjs']]) {
    const path = `integration/clients/${filename}`
    assert.equal(scripts[command], `node ${path}`)
    execFileSync(process.execPath, ['--check', fileURLToPath(new URL(path, root))])
  }
  await assert.rejects(access(new URL('examples/', root)), { code: 'ENOENT' })
})

test('integration guides keep valid local links after consolidation', async () => {
  const files = [new URL('README.md', integration)]
  for (const file of await readdir(new URL('docs/', integration))) {
    if (file.endsWith('.md')) files.push(new URL(`docs/${file}`, integration))
  }
  assert.equal(files.length, 5)
  let links = 0
  for (const file of files) {
    const text = await readFile(file, 'utf8')
    for (const match of text.matchAll(/\]\((\.{1,2}\/[^\s)]+)\)/g)) {
      const target = new URL(match[1], file)
      target.hash = ''; target.search = ''
      await assert.doesNotReject(access(target), `${file.pathname}: ${match[1]}`)
      links++
    }
  }
  assert(links >= 30)
})

test('both READMEs expose the integration entry and link to the current guides', async () => {
  for (const filename of ['README.md', 'README.en.md']) {
    const text = await readFile(new URL(filename, root), 'utf8')
    assert(text.includes('](./integration/README.md)'))
    for (const name of ['office-integration', 'dashboard-integration', 'chat-integration', 'message-relay']) {
      assert(text.includes(`](./integration/docs/${name}.md)`))
    }
  }
})
