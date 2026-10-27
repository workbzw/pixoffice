import type { AgentInsights, AgentInsightBlock } from '@pixoffice/protocol/agent-insights'

/** Sample history is attached only by the local example data source. */
export function demoAgentInsights(index: number, now: Date, conversationId: string, domain?: 'commerce' | 'civic'): AgentInsights {
  const offset = index + (conversationId === 'main' ? 0 : conversationId.length)
  const labels = domain === 'civic' ? ['诉求受理', '材料核验', '现场协同', '回访归档'] : domain === 'commerce' ? ['商品策划', '素材制作', '价格核算', '商品复核'] : ['需求开发', '缺陷修复', '代码审查', '技术调研']
  const recent = domain === 'civic' ? [
    ['完成服务方案复核', '更新岗位分工安排', '完成上一轮服务复盘'],
    ['完成诉求分类核对', '跟进待补材料事项', '回访确认服务需求'],
    ['核对服务材料清单', '整理事项材料目录', '完成上一轮资料归集'],
    ['校对便民服务通知', '更新材料提示内容', '确认上一轮联络记录'],
    ['完成场地保障检查', '优化现场等候动线', '汇总上一轮现场情况'],
    ['复核回访结果记录', '核对未办结事项', '完成上一轮材料归档'],
  ][index % 6] : domain === 'commerce' ? ['完成商品信息复核', '更新商品任务方案', '完成上一轮经营复盘'] : ['完成接口边界检查', '更新任务执行方案', '完成上一轮结果验证']
  return { scope: 'conversation', updatedAt: now.toISOString(), periods: ([7, 30] as const).map(days => {
    const points = Array.from({ length: days }, (_, i) => {
      const date = new Date(now); date.setDate(date.getDate() - days + i + 1)
      return { label: `${date.getMonth() + 1}/${date.getDate()}`, value: Math.max(1, Math.round(3 + offset * .3 + i / days * 3 + Math.sin((i + offset) * 1.3) * 2)) }
    })
    const total = points.reduce((sum, point) => sum + point.value, 0)
    const counts = [.4, .25, .2].map(ratio => Math.floor(total * ratio))
    counts.push(total - counts.reduce((sum, count) => sum + count, 0))
    const categories = labels.map((label, i) => ({ label, value: counts[i] }))
    const primary: AgentInsightBlock = index % 3 === 0
      ? { id: 'results', type: 'distribution', title: domain === 'civic' ? '事项处理分布' : '任务结果分布', items: [{ label: '已完成', value: total }, { label: domain === 'civic' ? '处理中' : '执行中', value: 2 + index % 3 }, { label: domain === 'civic' ? '待补材料' : '失败', value: index % 2 }] }
      : index % 3 === 1 ? { id: 'categories', type: 'bars', title: '完成任务类型', unit: '项', items: categories }
        : { id: 'trend', type: 'trend', title: `${days} 天完成趋势`, unit: '项', points }
    const secondary: AgentInsightBlock = primary.type === 'trend'
      ? { id: 'categories', type: 'bars', title: '完成任务类型', unit: '项', items: categories }
      : { id: 'trend', type: 'trend', title: `${days} 天完成趋势`, unit: '项', points }
    return { id: days === 7 ? 'last7Days' : 'last30Days', label: `近 ${days} 天`,
      metrics: [
        { id: 'completed', label: domain === 'civic' ? '已办事项' : '完成任务', value: total, unit: '项', changePercent: 12 + index, sentiment: 'positive' },
        { id: 'running', label: domain === 'civic' ? '处理中' : '执行中', value: 2 + index % 3, unit: '项', sentiment: 'neutral' },
        { id: 'failed', label: domain === 'civic' ? '待补材料' : '失败任务', value: index % 2, unit: '项', changePercent: -14, sentiment: 'positive' },
        { id: 'duration', label: '平均耗时', value: 8 + index * 2, unit: '分', changePercent: -8, sentiment: 'positive' },
      ], blocks: [primary, secondary, { id: 'recent', type: 'activity', title: '最近动态', items: [
        { label: recent[0], occurredAt: now.toISOString(), status: 'completed' },
        { label: recent[1], occurredAt: new Date(now.getTime() - 3600000).toISOString(), status: 'running' },
        { label: recent[2], occurredAt: new Date(now.getTime() - 7200000).toISOString(), status: 'completed' },
      ] }],
    }
  }) }
}
