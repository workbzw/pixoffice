const base = (process.env.PIXOFFICE_URL ?? 'http://127.0.0.1:8765').replace(/\/$/, '')
const key = process.env.PIXOFFICE_API_KEY ?? 'pixoffice-demo-key'
async function post(data) {
  const response = await fetch(`${base}/api/pixoffice/messages`, { method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(40000) })
  const result = await response.json()
  if (result.code !== response.status || !response.ok) throw new Error(`${result.code}: ${result.msg}`)
  return result.data
}

console.log('等待页面中的人物点击、任务操作或详情选项。按 Ctrl+C 停止。')
try {
  for (;;) {
    const { actions } = await post({ type: 'ui.next', timeoutMs: 30000 }); const action = actions[0]
    if (!action) continue
    console.log('收到用户操作：', action)
    await post({ type: 'ui.respond', interactionId: action.id, presentation: { target: 'dialog', content: {
      template: 'detail-v1', title: action.action === 'dialog.action' ? '操作已提交' : '成员与任务详情',
      description: action.action === 'dialog.action' ? '登录模块已提交审核，等待审核人员处理。' : '登录接口与权限校验已完成，请检查异常场景与联调结果后提交审核。',
      fields: [{ label: '办公室', value: action.teamId }, { label: '操作', value: action.action }, { label: '对象', value: action.actorId ?? action.employeeId ?? action.taskId ?? action.optionId ?? '' }],
      actions: action.action === 'dialog.action' ? [] : [{ id: 'review', label: '提交审核' }],
    } } })
  }
} catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 }
