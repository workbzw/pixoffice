import { randomUUID } from 'node:crypto'

const baseUrl = (process.env.PIXOFFICE_URL ?? 'http://127.0.0.1:8765').replace(/\/$/, '')
const key = process.env.PIXOFFICE_API_KEY ?? 'pixoffice-demo-key'
async function post(data) {
  const response = await fetch(`${baseUrl}/api/pixoffice/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout((data.timeoutMs ?? 10000) + 10000),
  })
  const result = await response.json()
  if (result.code !== response.status) throw new Error('Response code does not match HTTP status')
  if (!response.ok && response.status !== 408) throw new Error(`${response.status}: ${result.msg}`)
  return result
}

const now = () => new Date().toISOString()
const development = {
  schemaVersion: '1.0', seq: 1, workspace: { id: 'office-1', name: '研发办公室' },
  conversations: [{
    id: 'main', title: '登录模块开发',
    whiteboard: { template: 'task-board-v1', title: '登录模块开发', status: 'running', description: '实现登录与权限校验。',
      steps: [{ id: 'develop', title: '开发与验收', progress: 25 }] },
    employees: [
      { id: 'coding', name: '代码开发', role: '开发功能', sceneActorId: 'office-lead', online: true },
      { id: 'testing', name: '自动化测试', role: '测试功能', sceneActorId: 'office-lead', online: true },
    ],
    tasks: [{ id: 'login', title: '登录模块开发', assigneeId: 'coding', status: 'running', progress: 25, summary: '实现登录与权限校验。', updatedAt: now() }],
    events: [],
  }],
}
const research = {
  schemaVersion: '1.0', seq: 1, workspace: { id: 'office-2', name: '产品办公室' },
  conversations: [{
    id: 'main', title: '需求调研', whiteboard: { template: 'task-board-v1', title: '', status: 'queued', steps: [] },
    employees: [{ id: 'research', name: '产品研究', role: '调研功能', sceneActorId: 'code-agent', online: true }],
    tasks: [{ id: 'research-task', title: '需求调研', assigneeId: 'research', status: 'running', summary: '梳理用户需求。', updatedAt: now() }],
    events: [],
  }],
}

try {
  console.log('请先打开服务器模式的 /office/ 页面。')
  const directory = await post({ type: 'office.read' })
  development.seq = (directory.data.state.offices.find(office => office.snapshot.workspace.id === development.workspace.id)?.snapshot.seq ?? 0) + 1
  research.seq = (directory.data.state.offices.find(office => office.snapshot.workspace.id === research.workspace.id)?.snapshot.seq ?? 0) + 1
  const chatUrl = process.env.CHAT_SERVICE_URL?.trim()
  const initialized = await post({ type: 'offices.initialize', offices: [development, research], ...(chatUrl ? { chat: { url: chatUrl } } : {}) })
  if (initialized.code === 202) { console.log('快照已缓存，本次未取得浏览器初始化确认。请检查服务器模式的 /office/ 页面及连接状态，再运行示例继续菜单联调。'); process.exit(0) }
  console.log('办公室已初始化：', initialized.data.state.offices)
  console.log('可绑定人物：', initialized.data.capabilities.scene.actors)
  await post({ teamId: 'office-1', command: {
    protocolVersion: '2.0', sceneId: 'office-1', commandId: randomUUID(), type: 'activity.start', capability: 'scene.say',
    participants: [{ entityId: 'office-lead', role: 'actor' }], params: { text: '登录模块已准备好，请确认是否提交。', durationMs: 3000 },
  } })
  console.log('等待页面上的确认或拒绝操作，最长 60 秒；选择结果由此 HTTP 请求返回。')
  const selected = await post({ conversationId: 'main', type: 'decision.request', teamId: 'office-1', timeoutMs: 60000,
    decision: { id: randomUUID(), actorId: 'office-lead', kind: 'confirmation', title: '是否提交登录模块？',
      description: '请检查实现结果后决定。', confirmLabel: '确认提交', rejectLabel: '暂不提交' } })
  if (selected.code === 408) console.log('已超时，没有默认同意，也没有修改任务状态。')
  else {
    console.log('用户选择结果：', selected.data)
    development.conversations[0].tasks[0].status = selected.data.choiceId === 'confirm' ? 'completed' : 'blocked'
    development.conversations[0].tasks[0].progress = selected.data.choiceId === 'confirm' ? 100 : 25
    development.conversations[0].tasks[0].updatedAt = now()
    development.seq++
    development.conversations[0].whiteboard.status = development.conversations[0].tasks[0].status
    development.conversations[0].whiteboard.steps[0].progress = development.conversations[0].tasks[0].progress
    await post({ type: 'office.snapshot', teamId: 'office-1', snapshot: development })
    console.log('已由后端更新任务状态：', development.conversations[0].tasks[0].status)
  }
  const state = await post({ type: 'office.read', teamId: 'office-1' })
  console.log('前端当前任务：', state.data.snapshot.conversations[0].tasks)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
