import type { DecisionRequest, DecisionRequester } from './DecisionSession.ts'

export function createDecisionPreview(teamId: string, requester: DecisionRequester): DecisionRequest[] {
  const content = teamId === 'office-content', analysis = teamId === 'office-analysis'
  const createdAt = Date.now(), expiresAt = createdAt + 60000, deadline = performance.now() + 60000
  const timing = { createdAt, expiresAt, deadline }
  return [
    { teamId, id: 'preview-priority', kind: 'choice', requester, ...timing, title: '下一步优先推进哪一项？',
      description: '本轮任务还有三个方向，需要你确定优先级。', options: content ? [
        { id: 'copy', label: '先完善文案', description: '打磨标题和正文，明确核心表达。' },
        { id: 'assets', label: '先整理素材', description: '补齐图片和资料，统一内容质量。' },
        { id: 'review', label: '先做发布检查', description: '核对事实与渠道要求。' },
      ] : analysis ? [
        { id: 'data', label: '先核对数据', description: '确认数据口径，补齐缺失明细。' },
        { id: 'trends', label: '先分析趋势', description: '识别经营变化和异常。' },
        { id: 'brief', label: '先整理简报', description: '把关键结论整理为管理摘要。' },
      ] : [
        { id: 'core', label: '先打通核心流程', description: '优先完成主流程，再处理边界情况。' },
        { id: 'tests', label: '先补齐测试', description: '验证关键路径，减少后续返工。' },
        { id: 'blockers', label: '先处理阻塞项', description: '先解决影响其他任务推进的问题。' },
      ] },
    { teamId, id: 'preview-review', kind: 'confirmation', requester, ...timing,
      title: content ? '是否发布这份内容？' : analysis ? '是否生成经营简报？' : '是否提交本轮审核？',
      description: content ? '将当前文案和素材整理为一份待发布内容。' : analysis ? '汇总本轮数据核验与趋势分析的结论。' : '将当前任务摘要和已完成的交付物整理为一份审核申请。',
      confirmLabel: content ? '确认发布' : analysis ? '生成简报' : '提交审核',
      rejectLabel: content ? '暂不发布' : analysis ? '暂不生成' : '暂不提交' },
  ]
}
