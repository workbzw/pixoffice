import type { DashboardConversation, DashboardTask } from '@pixoffice/protocol/dashboard'
import { OFFICE_ROSTER } from '@pixoffice/scene-office/core/roster'

export type CommerceStage = 'ready' | 'dispatching' | 'preparing' | 'approval' | 'observing' | 'decision' | 'optimizing' | 'reviewing' | 'updated' | 'completed' | 'paused' | 'rejected' | 'expired' | 'stopped'
export type CommerceStrategy = 'information' | 'coupon' | 'pause'
export type CommerceTeam = 'operations' | 'visual' | 'analysis'

export const commerceProduct = {
  name: '折叠电脑支架', price: 79, couponPrice: 74, estimatedCost: 43,
  title: '折叠电脑支架｜六档调节・便携收纳・适用 13–16 英寸笔记本',
  specification: '铝合金材质；六档角度；折叠收纳；适用 13–16 英寸笔记本。以上为虚构演示参数。',
}
export const commerceMetrics = {
  first: { impressions: 10000, visits: 360, orders: 9, price: 79 },
  information: { impressions: 10000, visits: 350, orders: 14, price: 79 },
  coupon: { impressions: 10000, visits: 380, orders: 13, price: 74 },
}
export function commerceMetricTable(strategy?: Exclude<CommerceStrategy, 'pause'>) {
  const values = strategy ? [commerceMetrics.first, commerceMetrics[strategy]] : [commerceMetrics.first]
  const headings = strategy ? '| 指标 | 首轮 24 小时 | 更新后 24 小时 |\n| --- | ---: | ---: |' : '| 指标 | 首轮 24 小时 |\n| --- | ---: |'
  const row = (label: string, read: (value: typeof commerceMetrics.first) => string | number) => `| ${label} | ${values.map(read).join(' | ')} |`
  return [headings, row('曝光', value => value.impressions.toLocaleString('en-US')), row('商品访问', value => value.visits),
    row('订单', value => value.orders), row('点击率', value => `${(value.visits / value.impressions * 100).toFixed(1)}%`),
    row('访问成交率', value => `${(value.orders / value.visits * 100).toFixed(1)}%`), row('成交单价', value => `${value.price} 元`),
    row('成交额', value => `${value.price * value.orders} 元`)].join('\n') + (strategy
    ? '\n\n以上均为本地模拟数据，两个观察窗口不是随机对照实验，不能据此证明优化效果。'
    : '\n\n以上均为本地模拟数据，仅描述首轮样本，尚未验证优化效果。')
}

export const commerceTeams = {
  operations: { id: 'office-1', name: '电商运营团队', description: '围绕折叠电脑支架，完成商品上架、反馈观察与经营优化。',
    roles: ['电商运营负责人', '商品策划', '商品图片', '商品文案', '定价与投放', '商品信息审核'] },
  visual: { id: 'office-content', name: '商品视觉团队', description: '制作主图、尺寸说明和详情页，让用户看清商品。',
    roles: ['视觉负责人', '主图策划', '素材整理', '详情设计', '移动端验收', '素材合规'] },
  analysis: { id: 'office-analysis', name: '经营分析团队', description: '观察曝光、访问、订单与咨询，提出可验证的优化措施。',
    roles: ['经营分析负责人', '流量分析', '订单整理', '用户反馈', '转化分析', '数据核验'] },
} satisfies Record<CommerceTeam, { id: string; name: string; description: string; roles: string[] }>

const teamTasks: Record<CommerceTeam, readonly [string, string, string][]> = {
  operations: [
    ['product-brief', '核对商品卖点', '确认六档调节、便携收纳和适用尺寸，避免夸大宣传。'],
    ['product-title', '优化商品标题', commerceProduct.title],
    ['product-images', '准备商品图片', '首图突出完整商品，补充折叠收纳图；尺寸说明进入发布检查。'],
    ['product-detail', '编排商品详情', '按使用场景、材质、尺寸兼容、调节与收纳顺序组织详情。'],
    ['product-price', '核算上架价格', '售价 79 元；模拟成本 43 元，未计广告、退货和固定成本。'],
    ['product-review', '完成上架检查', '核对标题、图片、参数与售价；补齐 13–16 英寸适用范围后才能上架。'],
  ],
  visual: [
    ['visual-brief', '统一商品视觉', '同一款折叠电脑支架，主图、场景图和详情参数保持一致。'],
    ['visual-main', '制作商品首图', '展示支架全貌，去掉遮挡商品的装饰与夸张卖点。'],
    ['visual-assets', '整理商品素材', '整理商品正面、侧面、折叠与使用场景素材。'],
    ['visual-detail', '设计详情页面', '突出六档调节和收纳方式，保留尺寸说明入口。'],
    ['visual-mobile', '检查手机端阅读', '核对首图裁切、详情字号与参数可读性。'],
    ['visual-review', '复核图片与描述', '不使用未经验证的承重、销量和绝对化宣传。'],
  ],
  analysis: [
    ['analysis-plan', '建立观察口径', '曝光 → 商品访问 → 订单；采用两个独立的模拟 24 小时窗口。'],
    ['analysis-traffic', '观察商品流量', '分别记录曝光、访问和点击率，不把点击增长当成成交增长。'],
    ['analysis-orders', '整理成交订单', '区分订单量与成交额，优惠后的单价单独记录。'],
    ['analysis-feedback', '归类购买咨询', '重点检查适用尺寸、稳定性和收纳问题。'],
    ['analysis-conversion', '分析成交漏斗', '结合访问成交率与咨询记录提出假设，不直接断言因果。'],
    ['analysis-verify', '核验经营数据', '所有样例数值为模拟数据，不接真实店铺，不产生费用。'],
  ],
}

const stageCopy: Record<CommerceStage, { title: string; description: string; note: string }> = {
  ready: { title: '电脑支架待派工', description: '等待负责人分派标题、图片、详情、定价与审核任务。', note: '开始演示后逐人通知，收到任务后开工。' },
  dispatching: { title: '电脑支架逐人派工', description: '负责人依次走访各工位，交代商品任务；收到后才开始工作。', note: '未收到安排的成员保持待命。' },
  preparing: { title: '电脑支架上架准备', description: '统一商品标题、详情、图片与 79 元售价，完成发布检查。', note: '模拟商品与经营数据；不会真实上架或扣费。' },
  approval: { title: '电脑支架待上架', description: '商品材料已复核，适用范围已补齐；等待你批准按 79 元上架。', note: '未确认不上架；拒绝或超时不会自动批准。' },
  observing: { title: '电脑支架首轮观察', description: '已模拟上架，正在汇总首个 24 小时的访问、成交与购买咨询。', note: '模拟时间推进：上架后 24 小时，不是真实等待。' },
  decision: { title: '电脑支架优化决策', description: '10,000 次曝光、360 次访问、9 单；尺寸兼容咨询集中，需要选择下一步。', note: '首轮成交率 2.5%；先提出假设，再验证措施。' },
  optimizing: { title: '电脑支架执行优化', description: '按已选措施更新商品，并重新检查发布内容。', note: '正常优化更新原商品，不重复下架与新建商品。' },
  reviewing: { title: '电脑支架更新复核', description: '修改成果已提交，审核员核对尺寸说明、商品图片与价格。', note: '审核职责已在首轮交代，成果到齐后复核。' },
  updated: { title: '电脑支架更新观察', description: '商品已完成模拟更新，正在整理第二个 24 小时观察窗口。', note: '观察价格、访问与订单，不只关注一个增长数字。' },
  completed: { title: '电脑支架经营复盘', description: '上架、观察、决策和商品更新已完成，查看两轮经营对比。', note: '样例趋势仅供演示；继续观察，不能据此保证销量。' },
  paused: { title: '电脑支架暂停推广', description: '按你的选择暂停新增推广，保留商品，继续排查尺寸信息与购买顾虑。', note: '未执行降价，也未生成优化后的销量结果。' },
  rejected: { title: '电脑支架暂缓上架', description: '你选择暂不上架，商品保持待发布；本轮不会继续生成销售数据。', note: '上架权限未获批准，后续观察与优化没有执行。' },
  expired: { title: '电脑支架待确认', description: '确认窗口已到期，待确认的上架或优化措施没有执行。', note: '超时不自动批准；没有生成后续成交结果。' },
  stopped: { title: '电脑支架演示停止', description: '演示已停止，保留本轮已完成的商品准备和经营记录。', note: '未完成的上架或优化措施不会继续执行。' },
}

export function commerceConversation(team: CommerceTeam, stage: CommerceStage, now: Date, strategy: CommerceStrategy = 'information'): DashboardConversation {
  const definition = commerceTeams[team], at = now.toISOString()
  const beforeListing = ['ready', 'dispatching', 'preparing'].includes(stage), halted = ['paused', 'rejected', 'expired', 'stopped'].includes(stage)
  const tasks: DashboardTask[] = teamTasks[team].map(([id, title, summary], index) => ({ id, title: stage === 'dispatching' && index === 0 ? '逐人交代商品任务' : title, summary,
    assigneeId: OFFICE_ROSTER[index].id, updatedAt: at,
    status: beforeListing ? stage !== 'ready' && index === 0 ? 'running' : 'queued' : halted ? 'blocked' : 'completed',
    progress: beforeListing ? stage !== 'ready' && index === 0 ? 20 : 0 : halted ? 60 : 100 }))
  const add = (id: string, title: string, assigneeId: string, summary: string, status: DashboardTask['status'], progress: number) => tasks.push({ id, title, assigneeId, summary, status, progress, updatedAt: at })
  if (stage === 'approval') add('listing-approval', '等待商品上架授权', 'office-lead', '标题、图片、详情和售价已就绪，等待确认。', 'blocked', 95)
  if (['observing', 'decision', 'optimizing', 'reviewing', 'updated', 'completed', 'paused'].includes(stage)) {
    add('first-observation', team === 'visual' ? '检查上架展示' : '观察首轮经营数据', 'review-agent',
      stage === 'observing' ? '汇总首个模拟 24 小时窗口。' : '模拟数据：10,000 曝光、360 访问、9 单，成交率 2.5%。', stage === 'observing' ? 'running' : 'completed', stage === 'observing' ? 15 : 100)
  }
  if (stage === 'decision') add('strategy-approval', '等待优化策略选择', 'office-lead', '尺寸兼容咨询较多，需决定补充说明、优惠验证或暂停推广。', 'blocked', 0)
  if (['optimizing', 'reviewing', 'updated', 'completed'].includes(stage)) {
    const status = stage === 'optimizing' ? 'queued' : 'completed'
    add('product-improvement', strategy === 'coupon' ? '配置 5 元优惠并核对底线' : team === 'analysis' ? '制定信息优化验证口径' : '补充尺寸图与适用说明',
      strategy === 'coupon' ? 'review-agent' : team === 'visual' ? 'file-agent' : 'app-agent',
      strategy === 'coupon' ? '标价仍为 79 元，模拟成交价 74 元；不把降价带来的订单变化当成免费增长。' : '新增 13–16 英寸尺寸图，明确适用与不适用范围，售价保持 79 元。', status, stage === 'optimizing' ? 0 : 100)
    add('update-review', '复核商品更新', 'data-agent', '按首轮约定，收到修改成果后复核内容与价格，再更新原商品。', stage === 'optimizing' ? 'queued' : stage === 'reviewing' ? 'running' : 'completed', stage === 'optimizing' || stage === 'reviewing' ? 0 : 100)
  }
  if (['updated', 'completed'].includes(stage)) add('second-observation', '对比更新后的经营表现', 'review-agent', stage === 'completed'
    ? strategy === 'coupon' ? '模拟：380 访问、13 单、成交价 74 元、成交额 962 元。' : '模拟：350 访问、14 单、成交率 4.0%、成交额 1,106 元。'
    : '正在汇总第二个模拟 24 小时窗口。', stage === 'completed' ? 'completed' : 'running', stage === 'completed' ? 100 : 20)
  if (stage === 'paused') add('pause-followup', '排查购买顾虑后再评估推广', 'code-agent', '先补足证据，不自动恢复推广或声称销售改善。', 'blocked', 0)
  const copy = { ...stageCopy[stage] }
  if (stage === 'completed') {
    const first = commerceMetrics.first, result = commerceMetrics[strategy === 'coupon' ? 'coupon' : 'information']
    copy.description = strategy === 'coupon' ? `订单 ${first.orders} → ${result.orders} 单，成交价 ${first.price} → ${result.price} 元。`
      : `订单 ${first.orders} → ${result.orders} 单，成交率 ${(first.orders / first.visits * 100).toFixed(1)}% → ${(result.orders / result.visits * 100).toFixed(1)}%。`
    copy.note = `模拟成交额：${first.orders * first.price} → ${(result.orders * result.price).toLocaleString('en-US')} 元。`
  }
  const firstDone = ['observing', 'decision', 'optimizing', 'reviewing', 'updated', 'completed', 'paused'].includes(stage)
  const secondDone = ['decision', 'optimizing', 'reviewing', 'updated', 'completed', 'paused'].includes(stage)
  return { id: 'main', title: '电脑支架上架与优化', employees: OFFICE_ROSTER.map((actor, index) => ({ id: actor.id, sceneActorId: actor.id, name: actor.name, role: definition.roles[index], online: true })),
    tasks, events: [{ id: `commerce-${stage}`, kind: 'note', summary: copy.description, occurredAt: at, employeeId: 'office-lead' }],
    whiteboard: { template: 'task-board-v1', title: copy.title, status: halted || ['approval', 'decision'].includes(stage) ? 'blocked' : stage === 'completed' ? 'completed' : stage === 'ready' ? 'queued' : 'running',
      tagline: '电商运营 · 模拟数据', description: copy.description, note: copy.note,
      steps: [{ id: 'listing', title: '商品与上架', progress: firstDone ? 100 : beforeListing ? 0 : 95 }, { id: 'observation', title: '销量与反馈', progress: secondDone ? 100 : stage === 'observing' ? 20 : 0 },
        { id: 'improvement', title: '优化与复盘', progress: stage === 'completed' ? 100 : stage === 'updated' ? 75 : stage === 'reviewing' ? 55 : stage === 'optimizing' ? 35 : 0 }] } }
}

export function commerceInitialHistory(teamId: string, conversationId: string) {
  const team = Object.entries(commerceTeams).find(([, definition]) => definition.id === teamId)?.[0] as CommerceTeam | undefined
  if (!team) return []
  const messages = conversationId === 'main' ? [
    team === 'visual' ? '为这款 79 元折叠电脑支架准备主图、详情和尺寸说明。' : team === 'analysis' ? '为电脑支架建立上架后的经营观察口径。' : '把这款 79 元折叠电脑支架做好上架准备，观察购买反馈后再优化。',
    `负责人将依次到各工位分派${team === 'visual' ? '商品图片与详情素材任务' : team === 'analysis' ? '流量、订单与购买咨询的观察任务' : '商品标题、图片、详情、定价与审核任务'}，成员收到安排后再开工。\n\n**商品设定**：${commerceProduct.specification}\n\n所有店铺操作与经营数据均为本地模拟，不真实上架或扣费。`,
  ] : conversationId === 'product-assets' ? ['商品素材和参数放在这个会话里核对。', `## 商品资料\n\n- 商品：${commerceProduct.name}\n- 标题：${commerceProduct.title}\n- 售价：79 元\n- 详情：使用场景 → 材质与尺寸 → 六档调节 → 折叠收纳 → 注意事项\n\n图片与文案须使用相同参数，不添加未经验证的承重与销量。`]
    : conversationId === 'conversion-review' ? ['后续在这里复盘商品表现。', '等待商品获批上架后，再整理模拟的 24 小时经营窗口。当前没有销售结果，不预先填写优化收益。'] : []
  return messages.map((content, index) => ({ role: index % 2 ? 'assistant' as const : 'user' as const, content }))
}

export function commerceAssetConversation(team: CommerceTeam, id: 'product-assets' | 'conversion-review', now: Date): DashboardConversation {
  const main = commerceConversation(team, 'preparing', now)
  return { id, title: id === 'product-assets' ? '商品素材与参数' : '经营复盘', employees: main.employees, tasks: [], events: [],
    whiteboard: { template: 'task-board-v1', title: id === 'product-assets' ? '折叠电脑支架 · 商品资料' : '折叠电脑支架 · 经营复盘', status: 'queued', tagline: '电商运营 · 模拟数据',
      description: id === 'product-assets' ? '核对标题、主图、详情与适用尺寸，售价 79 元。' : '商品获批上架后，再查看访问、订单与购买咨询。',
      note: '仅展示当前会话的目标与任务。', steps: [] } }
}
