import type { OfficeDataSource } from '@pixoffice/protocol/dashboard'
import { idSchema } from '@pixoffice/protocol'
import { maxRelayTeams } from '@pixoffice/protocol/relay'

export type OfficeTeamDefinition = {
  id: string
  name: string
  sceneLabel: string
  description?: string
  source: OfficeDataSource
}
export type OfficeCreationInput = { name: string }
export type OfficeTeamCreator = (input: OfficeCreationInput) => Promise<OfficeTeamDefinition>

export function assertOfficeDirectory(teams: readonly Pick<OfficeTeamDefinition, 'id'>[]) {
  if (teams.length > maxRelayTeams) throw new Error(`最多支持 ${maxRelayTeams} 个办公室`)
  if (teams.some(team => !idSchema.safeParse(team.id).success) || new Set(teams.map(team => team.id)).size !== teams.length) throw new Error('办公室 ID 无效或重复')
}
