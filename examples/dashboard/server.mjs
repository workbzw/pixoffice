import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'

const host = '127.0.0.1'
const port = Number(process.env.OFFICE_DASHBOARD_EXAMPLE_PORT || 18770)
const now = () => new Date().toISOString()
const employees = [
  { id: 'leader', sceneActorId: 'marvis', name: '王明', role: '负责人', online: true },
  { id: 'research', sceneActorId: 'code-agent', name: '李研', role: '信息检索', online: true },
  { id: 'files', sceneActorId: 'file-agent', name: '周理', role: '资料整理', online: true },
  { id: 'writing', sceneActorId: 'app-agent', name: '陈书', role: '文案撰写', online: true },
  { id: 'market', sceneActorId: 'review-agent', name: '刘市', role: '市场分析', online: true },
  { id: 'review', sceneActorId: 'data-agent', name: '赵审', role: '内容审核', online: true },
]
const tasks = [
  { id: 'monitor', title: '跟踪竞品新品', assigneeId: 'research', status: 'running', progress: 45, updatedAt: now(), summary: '整理今日上新的竞品信息。' },
  { id: 'brief', title: '撰写市场简报', assigneeId: 'writing', status: 'queued', progress: 0, updatedAt: now(), summary: '等待检索结果。' },
  { id: 'review', title: '复核简报', assigneeId: 'review', status: 'blocked', progress: 20, updatedAt: now(), summary: '等待简报初稿。' },
]
const events = [{ id: randomUUID(), kind: 'note', employeeId: 'research', taskId: 'monitor', summary: '开始跟踪竞品新品', occurredAt: now() }]

function send(response, status, value, origin) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  })
  response.end(JSON.stringify(value))
}

function update(action) {
  const task = tasks.find(item => item.id === action.taskId)
  if (!task) throw new Error('任务不存在')
  let kind
  let summary
  if (action.type === 'task.assign') {
    const employee = employees.find(item => item.id === action.assigneeId)
    if (!employee || task.status === 'completed' || task.assigneeId === employee.id) throw new Error('无法分配给该员工')
    task.assigneeId = employee.id
    task.status = 'queued'
    task.progress = 0
    kind = 'task.assigned'
    summary = `任务已交给${employee.name}`
  } else if (action.type === 'task.start' && ['queued', 'blocked'].includes(task.status)) {
    task.status = 'running'; kind = 'task.started'; summary = '开始执行任务'
  } else if (action.type === 'task.block' && task.status === 'running') {
    task.status = 'blocked'; kind = 'task.blocked'; summary = '任务遇到阻塞'
  } else if (action.type === 'task.complete' && ['running', 'blocked'].includes(task.status)) {
    task.status = 'completed'; task.progress = 100; kind = 'task.completed'; summary = '任务已完成'
  } else throw new Error('当前状态不允许此操作')
  task.updatedAt = now()
  events.unshift({ id: randomUUID(), kind, taskId: task.id, employeeId: task.assigneeId, fromEmployeeId: kind === 'task.assigned' ? 'leader' : undefined, summary, occurredAt: task.updatedAt })
  events.splice(100)
}

createServer(async (request, response) => {
  const origin = request.headers.origin
  const allowedOrigin = origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ? origin : undefined
  const url = new URL(request.url, `http://${host}:${port}`)
  if (origin && !allowedOrigin) return send(response, 403, { error: '仅供本地开发页面接入' })
  if (request.method === 'OPTIONS') return send(response, 204, null, allowedOrigin)
  if (request.method === 'GET' && url.pathname === '/snapshot') {
    return send(response, 200, { schemaVersion: '1.0', workspace: { id: 'example-office', name: '市场情报空间' }, employees, tasks, events }, allowedOrigin)
  }
  if (request.method === 'POST' && url.pathname === '/actions') {
    try {
      let body = ''
      for await (const chunk of request) {
        body += chunk
        if (body.length > 65536) throw new Error('请求体过大')
      }
      update(JSON.parse(body))
      return send(response, 200, { ok: true }, allowedOrigin)
    } catch (error) {
      return send(response, 400, { error: error instanceof Error ? error.message : '请求无效' }, allowedOrigin)
    }
  }
  send(response, 404, { error: '未找到接口' }, allowedOrigin)
}).listen(port, host, () => console.log(`Dashboard example: http://${host}:${port}/snapshot`))
