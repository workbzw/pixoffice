import assert from 'node:assert/strict'

const base = (process.env.PIXOFFICE_URL ?? 'http://127.0.0.1:8765').replace(/\/$/, '')
const key = process.env.PIXOFFICE_API_KEY ?? 'pixoffice-demo-key'
for (const pathname of ['/', '/office/', '/minimal/', '/classroom/', '/farm/', '/health', '/pixoffice-config.js']) {
  const response = await fetch(base + pathname, { signal: AbortSignal.timeout(5000) })
  assert.equal(response.status, 200, pathname)
  const text = await response.text()
  if (key !== 'pixoffice-demo-key') assert(!text.includes(key), 'Custom API key leaked into a public response')
  console.log(`${pathname}: OK`)
}

const controller = new AbortController()
const deadline = setTimeout(() => controller.abort(), 10_000)
let reader
try {
  const response = await fetch(`${base}/api/pixoffice/events?teams=relay-smoke-check`, { signal: controller.signal })
  assert.equal(response.status, 200)
  reader = response.body.getReader()
  await reader.read()
  const payload = { teamId: 'relay-smoke-check', command: {
    protocolVersion: '2.0', sceneId: 'relay-smoke-check', commandId: 'relay-smoke-check', type: 'activity.start',
    capability: 'scene.say', participants: [{ entityId: 'smoke-actor', role: 'actor' }], params: { text: 'Smoke test', durationMs: 1000 },
  } }
  const post = async token => fetch(`${base}/api/pixoffice/messages`, { method: 'POST',
    signal: controller.signal, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  assert.equal((await post('incorrect-key')).status, 401)
  const delivered = await post(key)
  assert.equal(delivered.status, 200)
  const result = await delivered.json()
  assert.deepEqual(Object.keys(result).sort(), ['code', 'data', 'msg'])
  assert.equal(result.data.forwarded, 1)
  const frame = new TextDecoder().decode((await reader.read()).value)
  assert(frame.includes('relay-smoke-check'))
  console.log('POST authentication and SSE forwarding: OK')
} finally {
  clearTimeout(deadline); controller.abort(); await reader?.cancel().catch(() => {})
}
