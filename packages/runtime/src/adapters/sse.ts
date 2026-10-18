import { maxRelayEventBytes, relayPaths } from '@pixoffice/protocol/relay'
import { parseProtocolObject } from '@pixoffice/protocol/schema'
import { SceneMessageClient } from './messages.ts'
import type { MessageReceiver, MessageTransport, TransportOptions } from './messages.ts'

export type EventSourcePort = Pick<EventSource, 'onopen' | 'onerror' | 'onmessage' | 'close'>
export type EventSourceFactory = (url: string) => EventSourcePort

export class SseMessageTransport implements MessageTransport {
  private readonly baseUrl: string
  private readonly createEventSource: EventSourceFactory
  constructor(baseUrl = '', createEventSource: EventSourceFactory = url => new EventSource(url)) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.createEventSource = createEventSource
  }
  connect({ teamIds, workspace, onMessage, onStatus }: TransportOptions) {
    const query = new URLSearchParams({ teams: teamIds.join(',') })
    if (workspace) query.set('workspace', '1')
    const source = this.createEventSource(`${this.baseUrl}${relayPaths.events}?${query}`)
    let active = true
    source.onopen = () => { if (active) onStatus('已连接') }
    source.onerror = () => { if (active) onStatus('重连中') }
    source.onmessage = event => {
      if (!active) return
      try {
        if (new TextEncoder().encode(event.data).byteLength > maxRelayEventBytes) throw new Error('Message too large')
        onMessage(parseProtocolObject(event.data))
      } catch (error) { console.warn('[SceneSSE] invalid message skipped', error) }
    }
    return () => { active = false; source.onopen = null; source.onerror = null; source.onmessage = null; source.close() }
  }
}

// One subscription per relay URL in this browser application, shared by all teams.
const clients = new Map<string, SceneMessageClient>()
export function connectSceneRelay(runtime: MessageReceiver, baseUrl: string, onStatus: (status: string) => void = () => {}) {
  const key = baseUrl.replace(/\/$/, '')
  let client = clients.get(key)
  if (!client) { client = new SceneMessageClient(new SseMessageTransport(key)); clients.set(key, client) }
  const detach = client.register(runtime, onStatus)
  return () => { detach(); if (!client.size && clients.get(key) === client) clients.delete(key) }
}
