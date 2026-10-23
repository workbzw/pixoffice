const baseUrl = (process.env.PIXOFFICE_URL ?? 'http://127.0.0.1:8765').replace(/\/$/, '')
const key = process.env.PIXOFFICE_API_KEY ?? 'pixoffice-demo-key'

try {
  const response = await fetch(`${baseUrl}/api/pixoffice/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'office.read' }), signal: AbortSignal.timeout(20000),
  })
  const result = await response.json()
  if (!response.ok || result.code !== response.status) throw new Error(`${response.status}: ${result.msg}`)
  if (!result.data.capabilities || !result.data.state) throw new Error('Missing capabilities or state')
  // The same data structure is returned by offices.initialize.
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
