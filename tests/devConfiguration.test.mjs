import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { resolveConfig } from 'vite'
import { createDevEnvironment } from '../scripts/dev-config.mjs'

function proxyEnvironment(t, value) {
  const previous = process.env.PIXOFFICE_INTERNAL_API_URL
  if (value === undefined) delete process.env.PIXOFFICE_INTERNAL_API_URL
  else process.env.PIXOFFICE_INTERNAL_API_URL = value
  t.after(() => {
    if (previous === undefined) delete process.env.PIXOFFICE_INTERNAL_API_URL
    else process.env.PIXOFFICE_INTERNAL_API_URL = previous
  })
}
const viteConfig = fileURLToPath(new URL('../vite.config.ts', import.meta.url))

test('joint development uses one server address and no build-time relay override', () => {
  const env = createDevEnvironment({ PIXOFFICE_API_KEY: 'private-test-key' })
  assert.equal(env.server.PORT, '8765')
  assert.equal(env.server.HOST, '127.0.0.1')
  assert.equal(env.server.PIXOFFICE_SERVE_STATIC, 'false')
  assert.equal(env.server.PIXOFFICE_API_KEY, 'private-test-key')
  assert.equal(env.vite.PIXOFFICE_INTERNAL_API_URL, 'http://127.0.0.1:8765')
  assert.equal(env.vite.VITE_PIXOFFICE_RELAY_URL, undefined)
})

test('custom ports and wildcard or IPv6 hosts stay aligned with the development proxy', () => {
  for (const [host, address] of [['0.0.0.0', '127.0.0.1'], ['::', '[::1]'], ['::1', '[::1]'], ['localhost', 'localhost']]) {
    const env = createDevEnvironment({ PORT: '18765', HOST: host, PIXOFFICE_INTERNAL_API_URL: 'http://outdated-server:8765' })
    assert.equal(env.server.PORT, '18765')
    assert.equal(env.server.HOST, host)
    assert.equal(env.vite.PIXOFFICE_INTERNAL_API_URL, `http://${address}:18765`)
  }
})

test('invalid server ports fail before starting either development process', () => {
  for (const port of ['', '0', '-1', '65536', '8765.5', 'invalid']) assert.throws(() => createDevEnvironment({ PORT: port }), /Invalid PORT/)
})

test('pure Vite development has no implicit backend or config proxy', async t => {
  proxyEnvironment(t, undefined)
  const config = await resolveConfig({ configFile: viteConfig }, 'serve')
  assert.equal(config.server.proxy, undefined)
})

test('joint development proxies both messages and the same runtime configuration resource', async t => {
  const env = createDevEnvironment({ PORT: '18765' })
  proxyEnvironment(t, env.vite.PIXOFFICE_INTERNAL_API_URL)
  const config = await resolveConfig({ configFile: viteConfig }, 'serve')
  assert.equal(config.server.proxy['/api/pixoffice'].target, 'http://127.0.0.1:18765')
  assert.equal(config.server.proxy['/pixoffice-config.js'].target, 'http://127.0.0.1:18765')
  assert.equal(Object.keys(config.server.proxy).length, 2)
})
