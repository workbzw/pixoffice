import { randomUUID } from 'node:crypto'

const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object'
  ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}` : JSON.stringify(value)

// Loopback-only development relay. Production hosts own authentication and durable queues.
export function createSceneGateway({ now = Date.now } = {}) {
  const pending = new Map()
  const commands = new Map()
  const events = new Map()
  let sequence = 0
  let owner
  let state = null
  const epoch = randomUUID()

  const activeOwner = req => {
    if (!owner || owner.expiresAt <= now() || req.headers['x-scene-runtime'] !== owner.id) throw Object.assign(new Error('Lease lost'), { status: 409 })
    owner.expiresAt = now() + 10000
  }
  return async function handle(req, res, url, sendJson, readBody) {
    if (!url.pathname.startsWith('/scene/')) return false
    try {
      if (url.pathname === '/scene/connect' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req))
        if (typeof body.runtimeId !== 'string' || body.runtimeId.length > 100 || body.sceneId !== 'office-1') throw new Error('Invalid scene/runtime')
        if (owner && owner.expiresAt > now() && owner.id !== body.runtimeId) throw Object.assign(new Error('Another runtime owns this scene'), { status: 409 })
        owner = { id: body.runtimeId, expiresAt: now() + 10000 }
        sendJson(res, 200, { leaseMs: 10000, serverTime: now(), epoch }); return true
      }
      if (url.pathname === '/scene/commands' && req.method === 'POST') {
        const payload = JSON.parse(await readBody(req))
        const list = Array.isArray(payload?.commands) ? payload.commands : [payload]
        if (!list.length || list.length > 32 || list.some(c => typeof c?.commandId !== 'string' || c.commandId.length > 100 || c.sceneId !== 'office-1')) throw new Error('Invalid command envelope')
        if (new Set(list.map(c => c.commandId)).size !== list.length) throw new Error('Duplicate command IDs in batch')
        if (pending.size >= 128) throw Object.assign(new Error('Queue full'), { status: 429 })
        const prior = list.map(c => commands.get(c.commandId))
        if (prior.some((p, i) => p && canonical(p.command) !== canonical(list[i]))) throw Object.assign(new Error('Command ID conflict'), { status: 409 })
        if (prior.every(Boolean)) { sendJson(res, 200, { commands: prior }); return true }
        if (prior.some(Boolean)) throw Object.assign(new Error('Partially duplicate batch; query command results first'), { status: 409 })
        if (commands.size + list.length > 512) for (const [id, c] of commands) { if (!pending.has(c.cursor) && !['queued', 'running'].includes(c.status)) commands.delete(id); if (commands.size + list.length <= 512) break }
        if (commands.size + list.length > 512) throw Object.assign(new Error('Command history full'), { status: 429 })
        sequence++
        pending.set(sequence, { cursor: sequence, payload })
        list.forEach(command => commands.set(command.commandId, { command, cursor: sequence, status: 'pending' }))
        if (commands.size > 512) for (const [id, c] of commands) { if (!pending.has(c.cursor) && !['queued', 'running'].includes(c.status)) commands.delete(id); if (commands.size <= 400) break }
        sendJson(res, 202, { cursor: sequence, commandIds: list.map(c => c.commandId) }); return true
      }
      if (url.pathname === '/scene/commands' && req.method === 'GET') {
        activeOwner(req)
        // Pending items are non-destructive; receipts, not GET, acknowledge them.
        sendJson(res, 200, { commands: [...pending.values()].slice(0, 32) }); return true
      }
      if (url.pathname === '/scene/receipts' && req.method === 'POST') {
        activeOwner(req)
        const body = JSON.parse(await readBody(req))
        if (!Array.isArray(body.receipts) || body.receipts.length > 32) throw new Error('Invalid receipts')
        for (const receipt of body.receipts) {
          if (!pending.has(receipt.cursor)) continue
          for (const result of receipt.results ?? []) {
            const record = commands.get(result.commandId)
            if (record && record.cursor === receipt.cursor) Object.assign(record, result)
          }
          pending.delete(receipt.cursor)
        }
        sendJson(res, 200, { ok: true }); return true
      }
      if (url.pathname === '/scene/events' && req.method === 'POST') {
        activeOwner(req)
        const body = JSON.parse(await readBody(req))
        if (!Array.isArray(body.events) || body.events.length > 256) throw new Error('Invalid events')
        for (const event of body.events) {
          if (!event || typeof event.eventId !== 'string' || event.runtimeId !== owner.id) throw new Error('Invalid event')
          events.set(event.eventId, event)
          if (event.type === 'command.status') {
            const record = commands.get(event.data?.commandId)
            if (record) Object.assign(record, event.data)
          }
        }
        while (events.size > 256) events.delete(events.keys().next().value)
        sendJson(res, 200, { ok: true }); return true
      }
      if (url.pathname === '/scene/events' && req.method === 'GET') { sendJson(res, 200, { events: [...events.values()] }); return true }
      if (url.pathname === '/scene/state' && req.method === 'PUT') {
        activeOwner(req); state = JSON.parse(await readBody(req)); sendJson(res, 200, { ok: true }); return true
      }
      if (url.pathname === '/scene/state' && req.method === 'GET') { sendJson(res, 200, state ?? { connected: false }); return true }
      if (url.pathname === '/scene/capabilities' && req.method === 'GET') { sendJson(res, 200, state?.protocol ?? { connected: false }); return true }
      if (url.pathname.startsWith('/scene/commands/') && req.method === 'GET') {
        const record = commands.get(decodeURIComponent(url.pathname.slice('/scene/commands/'.length)))
        sendJson(res, record ? 200 : 404, record ?? { error: 'Command not found' }); return true
      }
      sendJson(res, 404, { error: 'Not found' })
    } catch (error) { sendJson(res, error.status ?? 400, { error: error.message }) }
    return true
  }
}
