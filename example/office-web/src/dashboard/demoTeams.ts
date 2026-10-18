import type { OfficeDataSource } from '@pixoffice/protocol/dashboard'
import { ExampleOfficeDataSource } from './demoSource.ts'
import type { OfficeTeamDefinition } from './officeDirectory.ts'

export type DemoOfficeTeam = OfficeTeamDefinition

export function createDemoOfficeTeams(source: OfficeDataSource, now = new Date()): DemoOfficeTeam[] {
  if (source.kind !== 'example') return []
  return [
    { id: 'office-1', name: '登录模块开发', sceneLabel: '办公室', description: '从需求拆解到接口、页面、联调和代码审查。', source },
    { id: 'office-content', name: '内容运营团队', sceneLabel: '办公室', description: '从选题、文案到发布，打磨每一份内容。', source: new ExampleOfficeDataSource(now, {
      workspace: { id: 'office-content', name: '内容运营团队' },
      roles: { 'code-agent': '选题策划', 'file-agent': '素材整理', 'app-agent': '内容撰写', 'review-agent': '渠道运营', 'data-agent': '质量审核' },
      tasks: [
        { id: 'topics', title: '本周内容选题', assigneeId: 'code-agent', status: 'completed', progress: 100 },
        { id: 'article', title: '产品介绍文案', assigneeId: 'app-agent', status: 'running', progress: 45, summary: '整理产品特点，起草面向用户的介绍内容。' },
        { id: 'materials', title: '推广素材整理', assigneeId: 'file-agent', status: 'running', progress: 68 },
        { id: 'content-review', title: '发布前内容检查', assigneeId: 'data-agent', status: 'queued', progress: 0 },
      ],
    }) },
    { id: 'office-analysis', name: '经营分析团队', sceneLabel: '办公室', description: '核对经营数据，把变化整理成清晰的结论。', source: new ExampleOfficeDataSource(now, {
      workspace: { id: 'office-analysis', name: '经营分析团队' },
      roles: { 'code-agent': '数据采集', 'file-agent': '报表整理', 'app-agent': '简报撰写', 'review-agent': '经营分析', 'data-agent': '数据核验' },
      tasks: [
        { id: 'sales', title: '销售报表汇总', assigneeId: 'file-agent', status: 'running', progress: 82 },
        { id: 'reconciliation', title: '收支数据核对', assigneeId: 'data-agent', status: 'blocked', progress: 35, summary: '等待补充本周渠道结算明细。' },
        { id: 'trends', title: '经营趋势分析', assigneeId: 'review-agent', status: 'queued', progress: 0 },
        { id: 'brief', title: '管理简报', assigneeId: 'app-agent', status: 'queued', progress: 0 },
      ],
    }) },
  ]
}
