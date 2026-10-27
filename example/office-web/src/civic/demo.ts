import type { DemoOfficeScenario } from '../dashboard/demoTeams.ts'
import { PreviewChatSource } from '../chat/sources.ts'
import { CivicOfficeDataSource } from './CivicOfficeDataSource.ts'
import { civicInitialHistory, civicTeams } from './scenario.ts'
import type { CivicTeam } from './scenario.ts'

export function civicChatSource(source?: CivicOfficeDataSource) {
  return new PreviewChatSource(source ? request => source.reply(request) : () => '当前为公务协同流程预览，尚未连接真实政务或 AI 服务。', {
    historyKey: 'civic-service-demo-v1', initialHistory: civicInitialHistory,
  })
}

export const civicDemoScenario: DemoOfficeScenario = {
  createSource: () => new CivicOfficeDataSource('coordination'),
  createChatSource: () => civicChatSource(),
  createTeams: source => (Object.keys(civicTeams) as CivicTeam[]).map((team, index) => ({ ...civicTeams[team], sceneLabel: '公务',
    source: index === 0 ? source : new CivicOfficeDataSource(team) })),
  createOffice: office => ({ ...office, sceneLabel: '公务', source: new CivicOfficeDataSource('coordination', new Date(), office) }),
}
