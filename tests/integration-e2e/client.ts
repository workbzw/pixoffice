import assert from 'node:assert/strict'
import { appendFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

export type Envelope<T extends object = Record<string, unknown>> = { code: number; msg: string; data: T }
export type OfficeSnapshot = {
  schemaVersion: '1.0'; seq: number; workspace: { id: string; name: string }
  employees: { id: string; sceneActorId?: string; name: string; online?: boolean }[]
  tasks: { id: string; title: string; status: string; assigneeId?: string; progress?: number; summary?: string; updatedAt: string }[]
  events: object[]
  whiteboard: { template: 'task-board-v1'; title: string; status: string; description: string; note: string; steps: { id: string; title: string; progress: number }[] }
}
export type UserAction = { id: string; teamId: string; action: string; actorId?: string; employeeId?: string; taskId?: string; interactionId?: string; optionId?: string }
export type Capabilities = { scene: { actors: { id: string; name: string; position: { x: number; y: number } }[];
  capabilities: { id: string }[] }; ui: object; requests: object; responses: object }
export type OfficeRead = { snapshot: OfficeSnapshot; scene: Capabilities['scene']; pendingDecisions: string[] }

function validateJson(value: unknown) {
  assert.notEqual(value, null, 'Protocol contains null')
  if (Array.isArray(value)) value.forEach(validateJson)
  else if (value && typeof value === 'object') Object.values(value).forEach(validateJson)
}

/** An external consumer: only documented HTTP and JSON, with no application imports. */
export class ExternalClient {
  constructor(readonly baseUrl: string, private readonly apiKey: string, private readonly logPath: string) {}
  async post<T extends object = Record<string, unknown>>(payload: object, options: { key?: string; timeoutMs?: number } = {}): Promise<Envelope<T>> {
    const startedAt = new Date().toISOString()
    try {
      const response = await fetch(`${this.baseUrl}/api/pixoffice/messages`, { method: 'POST',
        headers: { Authorization: `Bearer ${options.key ?? this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(options.timeoutMs ?? 20000) })
      const value = await response.json() as Envelope<T>
      await appendFile(this.logPath, `${JSON.stringify({ startedAt, payload, httpStatus: response.status, response: value })}\n`)
      validateJson(value)
      assert.deepEqual(Object.keys(value).sort(), ['code', 'data', 'msg'])
      assert.equal(value.code, response.status)
      assert.equal(typeof value.msg, 'string')
      assert(value.data && typeof value.data === 'object' && !Array.isArray(value.data), 'data must be an object')
      return value
    } catch (error) {
      await appendFile(this.logPath, `${JSON.stringify({ startedAt, payload, error: String(error) })}\n`)
      throw error
    }
  }
  read(teamId: string) { return this.post<OfficeRead>({ type: 'office.read', teamId }) }
  next(timeoutMs = 10000) { return this.post<{ actions: UserAction[] }>({ type: 'ui.next', timeoutMs }) }
  respond(interactionId: string, presentation: object) { return this.post({ type: 'ui.respond', interactionId, presentation }) }
  command(teamId: string, capability: string, participants: { entityId: string; role: string }[], params: object) {
    return this.post({ teamId, command: { protocolVersion: '2.0', sceneId: teamId, commandId: randomUUID(), type: 'activity.start', capability, participants, params } })
  }
}

export function office(id = 'team-a', seq = 1): OfficeSnapshot {
  return { schemaVersion: '1.0', seq, workspace: { id, name: id === 'team-a' ? '研发验收办公室' : '产品验收办公室' },
    employees: [{ id: 'developer', sceneActorId: 'office-lead', name: '验收开发员', online: true }, { id: 'researcher', sceneActorId: 'code-agent', name: '验收调研员', online: true }],
    tasks: [{ id: 'login', title: '登录模块验收', status: 'running', assigneeId: 'developer', progress: 35, summary: '验证真实后端对接与页面展示。', updatedAt: '2026-10-18T10:00:00Z' }], events: [],
    whiteboard: { template: 'task-board-v1', title: '研发交付计划', status: 'running', description: '完成协议、界面与验收。', note: '通过真实浏览器验收。', steps: [{ id: 'develop', title: '开发与联调', progress: 35 }] } }
}
