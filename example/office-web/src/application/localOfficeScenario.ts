import type { OfficeDataSource } from '@pixoffice/protocol/dashboard'
import type { OfficeTeamSession } from './OfficeTeamSession.ts'
import { CommerceOfficeDataSource } from '../dashboard/CommerceOfficeDataSource.ts'
import { CommerceDemoRun } from './CommerceDemoRun.ts'
import { PreviewChatSource } from '../chat/sources.ts'
import { CivicOfficeDataSource } from '../civic/CivicOfficeDataSource.ts'
import { CivicDemoRun } from '../civic/CivicDemoRun.ts'
import { civicChatSource } from '../civic/demo.ts'

export interface LocalOfficeDemoRun {
  readonly owner: OfficeTeamSession
  has(session: OfficeTeamSession): boolean
  start(): void
  tick(): void
  stop(): void
}

export function localOfficeScenario(source: OfficeDataSource) {
  if (source instanceof CivicOfficeDataSource) return {
    label: '公务保障', createChatSource: () => civicChatSource(source),
    createRun: (sessions: readonly OfficeTeamSession[], owner: OfficeTeamSession): LocalOfficeDemoRun => new CivicDemoRun(sessions, owner),
  }
  if (source instanceof CommerceOfficeDataSource) return {
    label: '电商流程', createChatSource: () => new PreviewChatSource(request => source.reply(request)),
    createRun: (sessions: readonly OfficeTeamSession[], owner: OfficeTeamSession): LocalOfficeDemoRun => new CommerceDemoRun(sessions, owner),
  }
}
