import type { DashboardConversation, DashboardTask } from '@pixoffice/protocol/dashboard'
import { OFFICE_ROSTER } from '@pixoffice/scene-office/core/roster'

export type CivicTeam = 'coordination' | 'field' | 'review'
export type CivicStage = 'ready' | 'dispatching' | 'preparing' | 'approval' | 'serving' | 'decision' | 'adjusting' | 'checking' | 'archiving' | 'completed' | 'paused' | 'rejected' | 'expired' | 'stopped'
export type CivicStrategy = 'guidance' | 'appointments' | 'hold'

export const civicCase = { title: '社区便民服务日保障', location: '清和社区服务中心', time: '周六 09:00–12:00' }
export const civicTeams = {
  coordination: { id: 'office-1', name: '公务综合协调组', description: '统筹社区便民服务日的需求、人员、通知与服务闭环。', roles: ['综合协调负责人', '诉求受理', '资料核验', '通知联络', '现场保障', '复核归档'] },
  field: { id: 'office-field', name: '公务现场保障组', description: '核对场地、服务动线与人员安排，跟进现场需求。', roles: ['现场统筹', '秩序引导', '场地检查', '便民指引', '应急联络', '现场复核'] },
  review: { id: 'office-review', name: '公务材料复核组', description: '统一事项口径，核验服务材料，汇总回访与归档记录。', roles: ['复核负责人', '事项核验', '资料归集', '文书校对', '结果统计', '归档审核'] },
} satisfies Record<CivicTeam, { id: string; name: string; description: string; roles: string[] }>

const preparations: Record<CivicTeam, readonly [string, string][]> = {
  coordination: [
    ['拆解服务保障任务', '明确受理、核验、通知、现场保障与归档责任，逐人交代后开工。'],
    ['梳理居民服务诉求', '将 12 项模拟诉求按咨询、材料核验和现场服务分类，记录待补充项。'],
    ['核对服务材料清单', '逐项核对办理材料与服务范围，只保留演示编号，不展示个人信息。'],
    ['编写便民服务通知', '统一活动时间、地点、预约方式与材料提示，公开通知须经确认。'],
    ['制定现场保障安排', '核对等候区、咨询台与无障碍通道，准备高峰时段人员安排。'],
    ['复核方案与通知', '核对材料清单、通知与岗位安排，确认后才进入现场服务阶段。'],
  ],
  field: [
    ['部署现场保障岗位', '逐人确认咨询引导、场地检查、便民指引、联络和复核职责。'],
    ['编排咨询等候动线', '区分已备齐材料与需要补充的居民，避免交叉等候。'],
    ['检查场地与服务设施', '核对入口标识、咨询台、等候座位与无障碍通道。'],
    ['制作便民指引卡', '用简明清单说明时间地点与材料准备，不收集真实身份信息。'],
    ['确认现场联络安排', '整理值守岗位和高峰支援顺序，模拟处置临时服务需求。'],
    ['复核现场保障清单', '核对各岗位就绪情况与现场注意事项，问题未解决不标记完成。'],
  ],
  review: [
    ['统一事项复核口径', '安排事项核验、资料归集、文书校对、结果统计和归档复核。'],
    ['核验受理事项范围', '核对 12 项模拟诉求的服务范围与材料要求。'],
    ['整理服务材料目录', '将通知、材料清单、岗位表和回访记录分别归类。'],
    ['校对便民通知文书', '核对时间地点与措辞，避免把咨询答复写成办理承诺。'],
    ['建立服务统计台账', '分别记录已完成、待补材料和待回访事项，统一统计口径。'],
    ['审核归档与隐私要求', '检查材料最小化、公开范围和归档目录，不展示居民隐私。'],
  ],
}

const stages: Record<CivicStage, { title: string; description: string; note: string }> = {
  ready: { title: '便民服务 · 待部署', description: '围绕 12 项居民服务诉求，准备材料清单、通知与现场保障。', note: '负责人逐人派工，成员收到安排后开工。' },
  dispatching: { title: '便民服务 · 逐人派工', description: '负责人依次交代受理、核验、联络、现场保障与归档任务。', note: '未收到安排的成员保持待命。' },
  preparing: { title: '便民服务 · 方案准备', description: '三组并行核对诉求、材料、服务通知与现场岗位安排。', note: '材料与通知完成复核后，请你确认保障方案。' },
  approval: { title: '便民服务 · 待确认', description: '方案、材料清单和岗位安排已复核，等待确认后启动服务。', note: '未确认不发布通知；拒绝或超时不视为同意。' },
  serving: { title: '便民服务 · 现场协同', description: '服务已模拟启动，持续汇总受理、材料补充和等候情况。', note: '模拟推进至服务开始后 30 分钟。' },
  decision: { title: '便民服务 · 保障调整', description: '12 项诉求中 8 项已完成，4 项待补材料；需要调整现场服务方式。', note: '先选择措施，再安排成员执行。' },
  adjusting: { title: '便民服务 · 补充保障', description: '按已选方案补充材料指引或分时回访，逐人交代后执行。', note: '待补材料事项如实保留，不自动视为办结。' },
  checking: { title: '便民服务 · 回访复核', description: '汇总服务结果，核对补充材料与回访记录，准备闭环归档。', note: '逐项确认结果，不把联系成功等同于事项完成。' },
  archiving: { title: '便民服务 · 资料归档', description: '回访结果已复核，正在汇总通知、服务台账与待办移交记录。', note: '归档完成后才将本轮保障流程标记为完成。' },
  completed: { title: '便民服务 · 已归档', description: '本轮服务保障、回访核对与材料归档已完成。', note: '服务流程完成不代表所有居民事项都已办结。' },
  paused: { title: '便民服务 · 暂缓调整', description: '保留首轮服务台账，4 项待补材料事项继续跟进，尚未执行新措施。', note: '没有生成后续办结结果，补充核实后再调整。' },
  rejected: { title: '便民服务 · 暂缓启动', description: '保障方案暂未通过，保留已准备材料，等待补充后再确认。', note: '没有发布通知，也没有生成现场服务结果。' },
  expired: { title: '便民服务 · 确认到期', description: '操作窗口已到期，待确认的方案或保障调整没有执行。', note: '超时不自动同意，已完成的工作记录保留。' },
  stopped: { title: '便民服务 · 已停止', description: '本轮流程已停止，保留已完成的材料与任务记录。', note: '尚未完成的任务不会继续执行或自动办结。' },
}

export const civicConversationIds = ['main', 'service-materials', 'service-review'] as const
export function civicResults(strategy: CivicStrategy) {
  return strategy === 'appointments' ? { completed: 10, pending: 2, waitMinutes: 7 } : { completed: 11, pending: 1, waitMinutes: 6 }
}
export function civicResultTable(strategy?: CivicStrategy) {
  const result = strategy ? civicResults(strategy) : undefined
  return ['| 服务指标 | 首轮汇总 |' + (result ? ' 回访复核后 |' : ''), '| --- | ---: |' + (result ? ' ---: |' : ''),
    `| 居民服务诉求 | 12 项 |${result ? ' 12 项 |' : ''}`, `| 已完成事项 | 8 项 |${result ? ` ${result.completed} 项 |` : ''}`,
    `| 待补材料事项 | 4 项 |${result ? ` ${result.pending} 项 |` : ''}`, `| 平均等候 | 18 分钟 |${result ? ` ${result.waitMinutes} 分钟 |` : ''}`,
    '\n以上为本地模拟台账，不连接真实政务系统，不包含居民个人信息。'].join('\n')
}

export function civicConversation(team: CivicTeam, stage: CivicStage, now: Date, strategy: CivicStrategy = 'guidance'): DashboardConversation {
  const at = now.toISOString(), beforeApproval = ['ready', 'dispatching', 'preparing'].includes(stage)
  const halted = ['paused', 'rejected', 'expired', 'stopped'].includes(stage)
  const tasks: DashboardTask[] = preparations[team].map(([title, summary], index) => ({ id: `service-prepare-${index}`, title, summary,
    assigneeId: OFFICE_ROSTER[index].id, updatedAt: at, status: beforeApproval ? index === 0 && stage !== 'ready' ? 'running' : 'queued' : 'completed',
    progress: beforeApproval ? index === 0 && stage !== 'ready' ? 15 : 0 : 100 }))
  const add = (id: string, title: string, assigneeId: string, summary: string, status: DashboardTask['status'], progress: number) => tasks.push({ id, title, assigneeId, summary, status, progress, updatedAt: at })
  if (stage === 'approval') add('service-approval', '等待保障方案确认', 'office-lead', '通知、材料清单和现场岗位已核对，等待负责人确认启动。', 'blocked', 0)
  if (['serving', 'decision', 'adjusting', 'checking', 'archiving', 'completed'].includes(stage)) {
    add('service-live', '跟进现场服务台账', 'review-agent', stage === 'serving' ? '汇总受理进度、待补材料与等候情况。' : '首轮 12 项诉求：8 项已完成，4 项待补材料，平均等候 18 分钟。', stage === 'serving' ? 'running' : 'completed', stage === 'serving' ? 15 : 100)
  }
  if (stage === 'decision') add('service-decision', '等待补充保障方式选择', 'office-lead', '选择增加材料预检引导、分时回访，或暂缓调整。', 'blocked', 0)
  if (['adjusting', 'checking', 'archiving', 'completed'].includes(stage)) {
    const appointments = strategy === 'appointments'
    add('service-followup', appointments ? '安排分时回访与材料补交' : '补充材料预检与现场引导', appointments ? 'code-agent' : 'app-agent',
      appointments ? '逐一告知缺少的材料，约定补交时段，未补齐的事项保留待办。' : '在咨询入口增加材料预检，发放简明清单，协助居民补齐材料。', stage === 'adjusting' ? 'queued' : 'completed', stage === 'adjusting' ? 0 : 100)
    add('service-check', '复核回访结果与材料', 'data-agent', '核对已完成和待补材料事项，保留下一步责任人与跟进记录。', stage === 'adjusting' ? 'queued' : stage === 'checking' ? 'running' : 'completed', stage === 'archiving' || stage === 'completed' ? 100 : 0)
    add('service-archive', '汇总服务情况并归档', 'file-agent', '汇总通知、岗位安排、服务台账与回访结果，移交仍需跟进的事项。', stage === 'completed' ? 'completed' : stage === 'archiving' ? 'running' : 'queued', stage === 'completed' ? 100 : 0)
  }
  const copy = { ...stages[stage] }
  if (stage === 'completed') {
    const result = civicResults(strategy)
    copy.description = `12 项诉求中 ${result.completed} 项已完成，${result.pending} 项待补材料；平均等候 18 → ${result.waitMinutes} 分钟。`
    copy.note = `${result.pending} 项待办已移交跟进；本轮服务保障流程完成。`
  }
  return { id: 'main', title: civicCase.title, employees: OFFICE_ROSTER.map((actor, index) => ({ id: actor.id, sceneActorId: actor.id, name: actor.name, role: civicTeams[team].roles[index], online: true })), tasks,
    events: [{ id: `civic-${stage}`, kind: 'note', summary: copy.description, employeeId: 'office-lead', occurredAt: at }],
    whiteboard: { template: 'task-board-v1', title: copy.title, status: halted || stage === 'approval' || stage === 'decision' ? 'blocked' : stage === 'completed' ? 'completed' : stage === 'ready' ? 'queued' : 'running',
      tagline: '公务协同 · 模拟事项', description: copy.description, note: copy.note, steps: [
        { id: 'preparation', title: '需求与方案', progress: beforeApproval ? 0 : stage === 'approval' ? 95 : 100 },
        { id: 'service', title: '现场与保障', progress: ['decision', 'adjusting', 'checking', 'archiving', 'completed'].includes(stage) ? 100 : stage === 'serving' ? 20 : 0 },
        { id: 'followup', title: '回访与归档', progress: stage === 'completed' ? 100 : stage === 'archiving' ? 90 : stage === 'checking' ? 65 : stage === 'adjusting' ? 35 : 0 },
      ] } }
}

export function civicSupportingConversation(team: CivicTeam, id: 'service-materials' | 'service-review', now: Date): DashboardConversation {
  const materials = id === 'service-materials'
  return { id, title: materials ? '服务材料与通知' : '服务复盘与归档', employees: civicConversation(team, 'ready', now).employees, tasks: [], events: [],
    whiteboard: { template: 'task-board-v1', title: materials ? '便民服务 · 材料清单' : '便民服务 · 复盘台账', tagline: '公务协同 · 模拟事项', status: 'queued',
      description: materials ? `${civicCase.location}，${civicCase.time}；核对通知、材料清单和岗位安排。` : '待服务方案确认并完成现场跟进后，汇总服务结果。',
      note: '不包含真实居民个人信息，不连接真实政务系统。', steps: [] } }
}

export function civicInitialHistory(conversationId: string) {
  const messages = conversationId === 'main' ? [
    '为周六社区便民服务日准备保障方案，服务过程中遇到问题再调整。',
    `## 服务保障事项\n\n- 地点：${civicCase.location}\n- 时间：${civicCase.time}\n- 待分类诉求：12 项\n\n负责人将逐人交代诉求受理、材料核验、通知联络、现场保障和复核归档任务。方案经你确认后才模拟启动服务。\n\n这是本地模拟事项，不发布真实通知，不包含居民个人信息。`,
  ] : conversationId === 'service-materials' ? [
    '把服务材料和通知集中在这里核对。',
    `## 材料目录\n\n1. 居民诉求分类清单\n2. 服务范围与材料准备清单\n3. 便民服务通知\n4. 现场岗位与等候动线\n5. 回访与归档记录\n\n活动安排：${civicCase.time}，${civicCase.location}。公开内容须复核，不展示居民身份信息。`,
  ] : conversationId === 'service-review' ? ['服务结束后，在这里复盘和移交未完成事项。', '目前尚未启动现场服务，没有服务成效数据。后续分别统计已完成、待补材料和待回访事项，不提前填写办结结果。'] : []
  return messages.map((content, index) => ({ role: index % 2 ? 'assistant' as const : 'user' as const, content }))
}
