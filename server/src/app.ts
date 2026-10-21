import { randomUUID, timingSafeEqual } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import type { FastifyRequest } from 'fastify'
import serveStatic from '@fastify/static'
import { idSchema, commandSchema, batchSchema } from '@pixoffice/protocol'
import { assertProtocolObject, parseProtocolObject, ProtocolValueFault, responseEnvelopeSchema, stringifyProtocolObject } from '@pixoffice/protocol/schema'
import { maxRelayEventBytes, maxRelayMessageBytes, maxRelayTeams, relayMessageSchema, relayPaths } from '@pixoffice/protocol/relay'
import { MessageRelay } from './relay.ts'
import { officeIntegrationPaths, officeMessageSchema, officeReplySchema, officeWorkspaceTopic, officeCapabilities, officeUiActionSchema, describeOfficeUi, officeSupportedMessages, officeErrorResultSchema, officeWorkspaceResultSchema } from '@pixoffice/protocol/office-integration'
import { createSceneRuntime } from '@pixoffice/runtime/createSceneRuntime'
import { referenceOfficeScenePack, describeOfficeScene } from '@pixoffice/scene-office/core'
import { OFFICE_ROSTER } from '@pixoffice/scene-office/core/roster'
import { OfficeRequests } from './officeRequests.ts'
import { OfficeState, OfficeStateFault } from './officeState.ts'
import { OfficeUi } from './officeUi.ts'
import { registerOfficeChat } from './officeChat.ts'
import { chatPath } from '@pixoffice/protocol/chat'

export const DEMO_API_KEY = 'pixoffice-demo-key'
export const defaultStaticRoot = fileURLToPath(new URL('../../dist/', import.meta.url))
export type ServerOptions = { apiKey?: string; staticRoot?: string; publicOrigin?: string; logger?: boolean; maxConnections?: number; maxBufferedBytes?: number; heartbeatMs?: number; maxOfficeRequests?: number; officeRequestMs?: number; chatTimeoutMs?: number }
const errorReasons: Record<number, string> = { 401: 'AUTH_FAILED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 408: 'REQUEST_TIMEOUT',
  410: 'REQUEST_CLOSED', 413: 'MESSAGE_TOO_LARGE', 422: 'BUSINESS_ERROR', 499: 'CALLER_DISCONNECTED', 500: 'INTERNAL_ERROR', 503: 'RECEIVER_UNAVAILABLE' }
const envelope = (code: number, msg: string, data?: unknown) => responseEnvelopeSchema.parse({ code, msg,
  data: code >= 400 ? officeErrorResultSchema.parse(data ?? { reasonCode: errorReasons[code] ?? 'INVALID_MESSAGE' }) : data ?? {} })
const matchesKey = (actual: unknown, expected: string) => typeof actual === 'string' &&
  Buffer.byteLength(actual) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
const protocolRoute = (url: string) => url.startsWith('/api/pixoffice/') || url.split('?')[0] === '/health'
const eventFrame = (value: unknown) => `data: ${stringifyProtocolObject(value)}\n\n`

export async function createPixOfficeServer(options: ServerOptions = {}) {
  const apiKey = options.apiKey ?? DEMO_API_KEY
  if (!apiKey.trim()) throw new Error('PIXOFFICE_API_KEY must not be empty')
  const publicOrigin = options.publicOrigin
  if (publicOrigin && (!/^https?:\/\//.test(publicOrigin) || new URL(publicOrigin).origin !== publicOrigin)) throw new Error('PIXOFFICE_PUBLIC_ORIGIN must be an HTTP(S) origin without a path')
  const app = Fastify({ logger: options.logger ? { redact: ['req.headers.authorization'] } : false, bodyLimit: maxRelayMessageBytes })
  app.addHook('preValidation', async (request, reply) => {
    if (request.method !== 'POST' || !protocolRoute(request.url)) return
    try { assertProtocolObject(request.body) }
    catch (error) { return reply.code(400).send(envelope(400, 'Invalid protocol value', { reasonCode: 'INVALID_MESSAGE',
      details: { path: error instanceof ProtocolValueFault ? error.path : '$', cause: error instanceof Error ? error.message : 'Invalid JSON' } })) }
  })
  app.addHook('onSend', async (request, reply, payload) => {
    if (!protocolRoute(request.url)) return payload
    if (request.url.split('?')[0] === chatPath && reply.statusCode === 200 && String(reply.getHeader('content-type')).startsWith('application/x-ndjson')) return payload
    try {
      const source = typeof payload === 'string' ? payload : Buffer.isBuffer(payload) ? payload.toString('utf8') : ''
      const response = responseEnvelopeSchema.parse(parseProtocolObject(source))
      if (response.code !== reply.statusCode) throw new Error('HTTP status mismatch')
    } catch { throw new Error('Invalid serialized protocol response') }
    return payload
  })
  const relay = new MessageRelay()
  const state = new OfficeState(), ui = new OfficeUi(), stateId = randomUUID()
  const discovery = createSceneRuntime(referenceOfficeScenePack)
  const capabilities = officeCapabilities(describeOfficeScene(discovery)); discovery.dispose()
  const workspace = (ready: { id: string; seq: number; runtimeReady: boolean }[] = []) => ({ offices: state.list().map(snapshot => ({ id: snapshot.workspace.id, name: snapshot.workspace.name, seq: snapshot.seq,
    runtimeReady: ready.some(office => office.id === snapshot.workspace.id && office.seq === snapshot.seq && office.runtimeReady), taskCount: snapshot.tasks.length })), actors: OFFICE_ROSTER.map(({ id, name }) => ({ id, name })),
    supportedMessages: [...officeSupportedMessages], sceneCommandProtocol: '2.0', ui: describeOfficeUi() })
  const publishSnapshot = (snapshot: ReturnType<OfficeState['list']>[number]) => relay.publish(officeWorkspaceTopic,
    eventFrame({ type: 'office.sync', snapshot }))
  const officeRequests = new OfficeRequests((message, responseToken) => {
    if (message.type !== 'decision.request') return
    relay.publish(officeWorkspaceTopic, eventFrame({ type: 'office.request.closed', responseToken }))
  }, options.maxOfficeRequests, options.officeRequestMs)
  const sameOrigin = (request: FastifyRequest) => {
    const expectedOrigin = publicOrigin ?? `${request.protocol}://${request.headers.host}`
    return request.headers['sec-fetch-site'] !== 'cross-site' && (!request.headers.origin || request.headers.origin === expectedOrigin)
  }
  const chat = registerOfficeChat(app, { sameOrigin, hasOffice: teamId => Boolean(state.get(teamId)), timeoutMs: options.chatTimeoutMs })
  const maxBufferedBytes = options.maxBufferedBytes ?? maxRelayEventBytes
  if (apiKey === DEMO_API_KEY && options.logger) app.log.warn('Using the public demo API key. Set PIXOFFICE_API_KEY before public deployment.')

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof OfficeStateFault) return reply.code(error.code).send(envelope(error.code, error.message, { reasonCode: error.reasonCode }))
    const fault: Error & { statusCode?: number } = error instanceof Error ? error : new Error('Unknown error')
    const status = fault.statusCode && fault.statusCode >= 400 && fault.statusCode < 500 ? fault.statusCode : 500
    reply.code(status).send(envelope(status, status === 500 ? 'Internal server error' : fault.message))
  })
  app.setNotFoundHandler((_request, reply) => reply.code(404).send(envelope(404, 'Not found')))
  app.get('/health', async () => envelope(200, 'OK'))
  app.get('/pixoffice-config.js', async (_request, reply) => reply.header('Cache-Control', 'no-store')
    .type('application/javascript').send('globalThis.__PIXOFFICE_CONFIG__ = { relayUrl: "/" };\n'))

  app.post(relayPaths.messages, { onRequest(request, reply, done) {
    if (!matchesKey(request.headers.authorization, `Bearer ${apiKey}`)) {
      reply.code(401).send(envelope(401, 'Invalid API key'))
    }
    done()
  } }, async (request, reply) => {
    const raw = request.body as { command?: unknown } | undefined
    const isScene = raw && typeof raw === 'object' && Object.hasOwn(raw, 'command')
    if (isScene) {
      const command = raw.command
      const checked = (command && typeof command === 'object' && 'commands' in command ? batchSchema : commandSchema).safeParse(command)
      if (!checked.success) return reply.code(400).send(envelope(400, 'Invalid scene command',
        { reasonCode: 'INVALID_MESSAGE', issues: checked.error.issues.map(issue => ({ ...issue, path: ['command', ...issue.path] })) }))
    }
    const parsed = isScene ? relayMessageSchema.safeParse(request.body) : null
    if (parsed && !parsed.success) return reply.code(400).send(envelope(400, 'Invalid scene command', { reasonCode: 'INVALID_MESSAGE', issues: parsed.error.issues }))
    if (!parsed?.success) {
      const business = officeMessageSchema.safeParse(request.body)
      if (!business.success) return reply.code(400).send(envelope(400, 'Invalid business message', { reasonCode: 'INVALID_MESSAGE', issues: business.error.issues }))
      const message = business.data
      let data = message
      if (data.type === 'office.capabilities') return envelope(200, 'OK', capabilities)
      if (data.type === 'office.read' && !data.teamId && (!state.list().length || !relay.hasReceiver(officeWorkspaceTopic))) return envelope(200, 'OK', workspace())
      if (data.type === 'office.read' && data.teamId && !state.get(data.teamId)) throw new OfficeStateFault(404, 'OFFICE_NOT_INITIALIZED', '办公室未初始化')
      if (data.type === 'ui.next') {
        const pending = ui.next(data.timeoutMs), abort = () => pending.cancel()
        reply.raw.on('close', abort)
        const action = await pending.response; reply.raw.off('close', abort)
        return reply.raw.destroyed ? reply : envelope(200, 'OK', { actions: action ? [action] : [] })
      }
      if (data.type === 'ui.respond') {
        const action = ui.get(data.interactionId)
        if (!action) throw new OfficeStateFault(410, 'UI_REQUEST_EXPIRED', '用户请求已结束或超时')
        if (data.presentation.target === 'whiteboard') {
          if (data.presentation.snapshot.workspace.id !== action.teamId) throw new OfficeStateFault(400, 'INVALID_MESSAGE', '白板快照与用户请求不属于同一办公室')
          const applied = state.apply([data.presentation.snapshot], true)
          if (applied.results[0].reasonCode === 'STALE_SEQ') throw new OfficeStateFault(409, 'STALE_SEQ', '白板快照已过期')
          publishSnapshot(state.get(action.teamId)!)
        }
        ui.respond(data.interactionId, data.presentation)
        return envelope(200, 'UI result delivered', { interactionId: data.interactionId, delivered: true })
      }
      if (data.type === 'offices.initialize' || data.type === 'office.snapshot') {
        const update = state.apply(data.type === 'offices.initialize' ? data.offices : [data.snapshot], data.type === 'office.snapshot')
        if (data.type === 'offices.initialize') {
          if (data.chat) chat.configure(data.chat)
          data = { type: 'offices.initialize', offices: data.offices }
        }
        if (data.type === 'office.snapshot' && update.results[0].reasonCode === 'STALE_SEQ') return envelope(200, 'Snapshot ignored', update.results[0])
        // Cached state may not have reached the browser; identical retries must be delivered again.
        if (data.type === 'offices.initialize') data = { ...data, offices: data.offices.filter(snapshot => snapshot.seq === state.get(snapshot.workspace.id)!.seq) }
        if (!relay.hasReceiver(officeWorkspaceTopic)) return reply.code(202).send(envelope(202, 'Cached; no online page can confirm application',
          data.type === 'offices.initialize' ? workspace() : { teamId: data.teamId, seq: data.snapshot.seq, status: 'cached' }))
      }
      const pending = officeRequests.open(message)
      if (!pending) {
        if (data.type === 'offices.initialize' || data.type === 'office.snapshot') {
          const snapshots = data.type === 'offices.initialize' ? data.offices : [data.snapshot]
          snapshots.forEach(publishSnapshot)
          return reply.code(202).send(envelope(202, 'State cached and published; browser result was not awaited', data.type === 'offices.initialize'
            ? workspace() : { teamId: data.teamId, seq: data.snapshot.seq, status: 'cached' }))
        }
        return reply.code(503).send(envelope(503, 'Too many pending business requests', { reasonCode: 'BUSINESS_QUEUE_FULL' }))
      }
      const abort = () => { if (!reply.raw.writableEnded) pending.cancel({ code: 499, msg: 'Caller disconnected', data: { reasonCode: 'CALLER_DISCONNECTED' } }) }
      reply.raw.on('close', abort)
      const delivery = { type: 'office.request', responseToken: pending.token, remainingMs: pending.remainingMs(), request: data }
      const sent = relay.publish(officeWorkspaceTopic, eventFrame(delivery))
      pending.setReceivers(sent.forwarded)
      if (!sent.matched || !sent.forwarded) pending.cancel({ code: sent.matched ? 503 : 409,
        msg: sent.matched ? 'Receiver unavailable or too slow' : 'No online page for this workspace or team', data: { reasonCode: sent.matched ? 'RECEIVER_UNAVAILABLE' : 'NO_RECEIVER' } })
      const response = await pending.response
      reply.raw.off('close', abort)
      if (reply.raw.destroyed) return reply
      const result = response.code === 200 && (data.type === 'offices.initialize' || data.type === 'office.read' && !data.teamId)
        ? workspace(officeWorkspaceResultSchema.parse(response.data).offices) : response.data
      return reply.code(response.code).send(envelope(response.code, response.msg, result))
    }
    const message = parsed.data
    const commands = 'commands' in message.command ? message.command.commands : [message.command]
    if (state.get(message.teamId) && commands.some(command => command.type === 'object.state.set'
      && capabilities.scene.objects.some(object => object.id === command.entityId && object.templateId === 'office.wall-whiteboard'))) {
      return reply.code(400).send(envelope(400, 'Update office whiteboards through office.snapshot', { reasonCode: 'SNAPSHOT_REQUIRED' }))
    }
    const result = relay.publish(message.teamId, eventFrame(message), officeWorkspaceTopic)
    if (!result.matched) return reply.code(409).send(envelope(409, 'No online page for this team', { reasonCode: 'NO_RECEIVER' }))
    if (!result.forwarded) return reply.code(503).send(envelope(503, 'Receiver unavailable or too slow', { reasonCode: 'RECEIVER_UNAVAILABLE' }))
    return envelope(200, 'Forwarded; animation completion is not acknowledged', { forwarded: result.forwarded })
  })

  app.post(officeIntegrationPaths.ui, async (request, reply) => {
    if (!sameOrigin(request)) return reply.code(403).send(envelope(403, 'Use a same-origin browser connection'))
    const parsed = officeUiActionSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send(envelope(400, 'Invalid UI action', { reasonCode: 'UNSUPPORTED_UI_ACTION', issues: parsed.error.issues }))
    const action = parsed.data, snapshot = state.get(action.teamId)
    if (!snapshot) throw new OfficeStateFault(404, 'OFFICE_NOT_INITIALIZED', '办公室未初始化')
    if (action.action === 'actor.inspect' && !OFFICE_ROSTER.some(actor => actor.id === action.actorId)) throw new OfficeStateFault(404, 'ACTOR_NOT_FOUND', '人物不存在')
    if (action.action === 'employee.inspect' && !snapshot.employees.some(employee => employee.id === action.employeeId)
      || 'taskId' in action && !snapshot.tasks.some(task => task.id === action.taskId)
      || action.action === 'task.assign' && !snapshot.employees.some(employee => employee.id === action.assigneeId)) throw new OfficeStateFault(400, 'INVALID_MESSAGE', '用户操作引用的数据不存在')
    const pending = ui.open(action), abort = () => pending.cancel()
    reply.raw.on('close', abort)
    const result = await pending.response; reply.raw.off('close', abort)
    if (reply.raw.destroyed) return reply
    return reply.code(result.code).send(envelope(result.code, result.code === 200 ? 'OK' : 'UI request ended', result.presentation ?? { reasonCode: result.reasonCode }))
  })

  // Browsers return business results using a one-use token, never the backend API key.
  app.post(officeIntegrationPaths.reply, { bodyLimit: 524_288 }, async (request, reply) => {
    if (!sameOrigin(request)) return reply.code(403).send(envelope(403, 'Use a same-origin browser connection'))
    const parsed = officeReplySchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send(envelope(400, 'Invalid business reply'))
    const outcome = officeRequests.reply(parsed.data)
    const code = outcome === 'accepted' ? 200 : outcome === 'expired' ? 410 : 400
    return reply.code(code).send(envelope(code, outcome === 'accepted' ? 'Result delivered' : outcome === 'expired' ? 'Request already closed' : 'Invalid result'))
  })

  app.get<{ Querystring: { teams?: string; workspace?: string } }>(relayPaths.events, async (request, reply) => {
    // Block cross-site browser subscriptions. This is not a replacement for viewer login.
    if (!sameOrigin(request)) {
      return reply.code(403).send(envelope(403, 'Use a same-origin browser connection'))
    }
    const workspace = request.query.workspace === '1'
    const teams = typeof request.query.teams === 'string' ? request.query.teams ? [...new Set(request.query.teams.split(','))] : [] : []
    if (request.query.teams !== undefined && typeof request.query.teams !== 'string' || request.query.workspace !== undefined && !workspace
      || !teams.length && !workspace || teams.length > maxRelayTeams || teams.some(team => !idSchema.safeParse(team).success)) {
      return reply.code(400).send(envelope(400, `Provide 1-${maxRelayTeams} valid team IDs`))
    }
    if (relay.size >= (options.maxConnections ?? 128)) return reply.code(503).send(envelope(503, 'Too many connections'))
    reply.hijack()
    const stream = reply.raw
    stream.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no', 'Connection': 'keep-alive' })
    stream.write('retry: 2000\n: connected\n\n')
    const close = () => { detach(); clearInterval(heartbeat); stream.destroy() }
    const send = (frame: string) => {
      if (stream.destroyed || stream.writableEnded || stream.writableLength + Buffer.byteLength(frame) > maxBufferedBytes) { close(); return false }
      stream.write(frame)
      return true
    }
    const detach = relay.add({ teams: new Set([...teams, ...(workspace ? [officeWorkspaceTopic] : [])]), send, close })
    const heartbeat = setInterval(() => send(': heartbeat\n\n'), options.heartbeatMs ?? 15_000)
    heartbeat.unref()
    stream.on('close', () => { detach(); clearInterval(heartbeat) })
    if (workspace) {
      send(eventFrame({ type: 'office.sync.start', stateId }))
      const snapshots = state.list()
      for (const snapshot of snapshots) {
        if (!send(eventFrame({ type: 'office.sync', snapshot }))) break
        await new Promise<void>(resolve => setImmediate(resolve))
      }
      send(eventFrame({ type: 'office.sync.complete', offices: state.list().map(snapshot => ({ teamId: snapshot.workspace.id, seq: snapshot.seq })) }))
    }
    return reply
  })

  app.addHook('preClose', async () => { chat.close(); ui.close(); officeRequests.close(); relay.close() })
  if (options.staticRoot) await app.register(serveStatic, { root: path.resolve(options.staticRoot), index: ['index.html'], redirect: true })
  return app
}
