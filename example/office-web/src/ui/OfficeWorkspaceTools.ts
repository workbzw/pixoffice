import type { OfficeTeamSelection } from './TeamSwitcher.tsx'
import type { OfficeTeamSession } from '../application/OfficeTeamSession.ts'
import type { OfficeLayoutId } from '@pixoffice/protocol/office-integration'

export interface OfficeWorkspaceToolsProps {
  teamSelection?: OfficeTeamSelection
  onOpenChange: (open: boolean) => void
  sceneReady?: boolean
  previewSessions?: ReadonlyMap<string, OfficeTeamSession>
  layoutId?: OfficeLayoutId
}
