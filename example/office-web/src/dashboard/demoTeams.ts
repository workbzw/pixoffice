import type { OfficeDataSource } from '@pixoffice/protocol/dashboard'
import { CommerceOfficeDataSource } from './CommerceOfficeDataSource.ts'
import { commerceTeams } from './commerceScenario.ts'
import type { OfficeTeamDefinition } from './officeDirectory.ts'

export type DemoOfficeTeam = OfficeTeamDefinition

export function createDemoOfficeTeams(source: OfficeDataSource, now = new Date()): DemoOfficeTeam[] {
  if (source.kind !== 'example') return []
  return [
    { ...commerceTeams.operations, sceneLabel: '办公室', source },
    { ...commerceTeams.visual, sceneLabel: '办公室', source: new CommerceOfficeDataSource('visual', now) },
    { ...commerceTeams.analysis, sceneLabel: '办公室', source: new CommerceOfficeDataSource('analysis', now) },
  ]
}
