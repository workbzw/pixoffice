import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'

const root = new URL('../', import.meta.url)

test('test-only check commands use the shared test directory', async () => {
  const { scripts } = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
  for (const [command, filename] of [['packages:check', 'check-packages.mjs'], ['packages:smoke', 'smoke-packages.mjs'], ['test:service', 'check-relay-service.mjs']]) {
    const entry = `tests/checks/${filename}`
    assert.equal(scripts[command], `node ${entry}`)
    await access(new URL(entry, root))
    await assert.rejects(access(new URL(`scripts/${filename}`, root)), { code: 'ENOENT' })
  }
  assert.equal(scripts['test:report'], 'playwright show-report tests/artifacts/integration-e2e-report')
})

test('browser results and reports stay inside the ignored test artifacts directory', async t => {
  const server = await createTestServer()
  t.after(() => server.close())
  const { default: config } = await server.ssrLoadModule('/tests/integration-e2e/playwright.config.ts')
  const directory = fileURLToPath(new URL('tests/integration-e2e/', root))
  const artifacts = fileURLToPath(new URL('tests/artifacts/', root))
  for (const output of [config.outputDir, ...config.reporter.flatMap(([, options]) => options?.outputFolder || options?.outputFile ? [options.outputFolder ?? options.outputFile] : [])]) {
    assert(path.resolve(directory, output).startsWith(artifacts), output)
  }
  assert((await readFile(new URL('.gitignore', root), 'utf8')).split('\n').includes('/tests/artifacts/'))
  assert((await readFile(new URL('.dockerignore', root), 'utf8')).split('\n').includes('tests/artifacts'))
  await access(new URL('tests/README.md', root))
})
