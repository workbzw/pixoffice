import { useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { RuntimeWorkspace } from './components/RuntimeWorkspace.tsx'
import { createOfficeRuntime } from './application/createOfficeRuntime.ts'
import { browserPersistence } from '@pixoffice/runtime/adapters/storage'
import { seatStepDurationMs } from '@pixoffice/scene-office/pixi/projection'
import { supportsCharacterPose } from './application/poseSupport.ts'
import { createOfficeDataSource } from './dashboard/createSource.ts'
import type { OfficeDataSource } from '@pixoffice/protocol/dashboard'
import type { SceneRuntime } from '@pixoffice/runtime/SceneRuntime'
import type { OfficeChatSource } from '@pixoffice/protocol/chat'
import { createOfficeChatSource } from './chat/sources.ts'
import { browserChatPersistence } from './chat/persistence.ts'
import type { ComponentType } from 'react'
import type { LayoutMode } from '../../shared/scene/layout.tsx'
import type { OfficeShellProps } from './ui/OfficeShell.tsx'
import type { OfficeTeamSelection } from './ui/TeamSwitcher.tsx'
import { DemoOfficeDirectory } from './dashboard/demoOfficeDirectory.ts'
import type { OfficeCreationInput, OfficeTeamCreator, OfficeTeamDefinition } from './dashboard/officeDirectory.ts'
import { assertOfficeDirectory } from './dashboard/officeDirectory.ts'
import { maxRelayTeams } from '@pixoffice/protocol/relay'
import type { OfficeSimulation } from './application/OfficeSimulation.ts'
import { OfficeTeamSession } from './application/OfficeTeamSession.ts'
import { officeTeamTransport } from './application/connectOfficeTeam.ts'
import { useOfficeTeamHost } from './controller/useOfficeTeamHost.ts'
import { useOfficeTeamDirectory } from './controller/useOfficeTeamDirectory.ts'
import { OfficeShell } from './ui/OfficeShell.tsx'
import { OfficeEmptyState } from './ui/OfficeEmptyState.tsx'
import { SceneOnlyLayout } from '../../shared/scene/layout.tsx'
import { sceneRelayUrl } from '../../shared/scene/connectionConfig.ts'
import { ConnectedOfficeWorkspace } from './ui/ConnectedOfficeWorkspace.tsx'

function createTeamRuntime(sceneId: string) {
  return createOfficeRuntime({ sceneId, referenceLayout: true, persistence: browserPersistence(localStorage, sceneId), seatStepDuration: seatStepDurationMs, supportsPose: supportsCharacterPose })
}

export function OfficeApp({ dataSource, runtime: suppliedRuntime, simulation, session: suppliedSession, chatSource: suppliedChatSource, layout, shell, teamSelection, decisionOpenToken, integrationError }: { layout?: LayoutMode; shell?: ComponentType<OfficeShellProps>; dataSource: OfficeDataSource; runtime?: SceneRuntime; simulation?: OfficeSimulation; session?: OfficeTeamSession; chatSource?: OfficeChatSource; teamSelection?: OfficeTeamSelection; decisionOpenToken?: number; integrationError?: string | null }) {
  const [defaultChatSource] = useState(createOfficeChatSource)
  const chatSource = suppliedSession?.chat.source ?? suppliedChatSource ?? defaultChatSource
  const decisionPreview = dataSource.kind === 'example' && chatSource.kind === 'preview'
  const session = useMemo(() => {
    if (suppliedSession) return suppliedSession
    const runtime = simulation?.runtime ?? suppliedRuntime ?? createTeamRuntime('office-1')
    return new OfficeTeamSession(runtime, dataSource, { simulation, transport: officeTeamTransport(runtime), decisionPreview, chatSource,
      chatPersistence: browserChatPersistence(runtime.sceneId, chatSource.historyKey ?? chatSource.kind) })
  }, [suppliedSession, suppliedRuntime, simulation, dataSource, decisionPreview, chatSource])
  const ownedSessions = useMemo(() => suppliedSession ? [] : [session], [suppliedSession, session])
  useOfficeTeamHost(ownedSessions)
  const { dashboard, dashboardError, connection, sceneLinkError, pendingTaskIds, actionError } = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  return <RuntimeWorkspace simulation={session.simulation} whiteboardProgress={session.whiteboardProgress} teamSelection={teamSelection} layout={layout} shell={shell} runtime={session.runtime} connection={connection} dashboard={dashboard} dashboardError={integrationError ?? dashboardError} sceneLinkError={sceneLinkError} dataMode={session.source.kind} canExecuteActions={session.ui.enabled || session.source.canExecute !== false} executeAction={session.execute} pendingTaskIds={pendingTaskIds} actionError={actionError} chatSession={session.chat} decisionSession={session.decisions} uiSession={session.ui} decisionOpenToken={decisionOpenToken} />
}

export function OfficeTeamWorkspace({ initialTeams, createTeam, chatSource, layout = 'full' }: {
  initialTeams: readonly OfficeTeamDefinition[]
  createTeam?: OfficeTeamCreator
  chatSource: OfficeChatSource
  layout?: LayoutMode
}) {
  const createEntry = (team: OfficeTeamDefinition) => {
    const runtime = createTeamRuntime(team.id)
    return { team, session: new OfficeTeamSession(runtime, team.source, { transport: officeTeamTransport(runtime), decisionPreview: team.source.kind === 'example' && chatSource.kind === 'preview', chatSource,
      chatPersistence: browserChatPersistence(team.id, chatSource.historyKey ?? chatSource.kind) }) }
  }
  const [entries, setEntries] = useState(() => { assertOfficeDirectory(initialTeams); return initialTeams.map(createEntry) })
  const creating = useRef(false)
  const teams = useMemo(() => entries.map(entry => entry.team), [entries])
  const sessions = useMemo(() => new Map(entries.map(entry => [entry.team.id, entry.session])), [entries])
  const [activeId, setActiveId] = useState(initialTeams[0]?.id ?? '')
  const [decisionOpenToken, setDecisionOpenToken] = useState(0)
  const hostedSessions = useMemo(() => [...sessions.values()], [sessions])
  useOfficeTeamHost(hostedSessions)
  const teamOptions = useOfficeTeamDirectory(teams, hostedSessions)
  const activeSession = sessions.get(activeId)
  const create = createTeam ? async (input: OfficeCreationInput) => {
    if (creating.current) throw new Error('正在创建办公室，请稍候')
    if (entries.length >= maxRelayTeams) throw new Error(`最多支持 ${maxRelayTeams} 个办公室`)
    creating.current = true
    try {
      const team = await createTeam(input)
      assertOfficeDirectory([...teams, team])
      const entry = createEntry(team)
      setEntries(current => [...current, entry])
      setActiveId(team.id)
    } finally { creating.current = false }
  } : undefined
  const select = (id: string) => {
    if (!teams.some(team => team.id === id) || id === activeId) return
    void sessions.get(id)?.refresh()
    setActiveId(id)
  }
  const openDecisions = (id: string) => {
    if (!sessions.has(id)) return
    select(id); setDecisionOpenToken(value => value + 1)
  }
  if (!activeSession) {
    const scene = <OfficeEmptyState create={create} />
    if (layout === 'scene') return <SceneOnlyLayout>{scene}</SceneOnlyLayout>
    return <OfficeShell connection="未连接" dashboard={null} dashboardError={null} sceneLinkError={null} dataMode="example"
      hasOffice={false} executeAction={async () => { throw new Error('暂无办公室') }} pendingTaskIds={[]} actionError={null} appearanceIds={{}} scene={scene} editing={false}
      canRecoverLayout={false} recoverLayout={() => {}} exportCapabilities={() => {}} exportSnapshot={() => {}} renderScenePanel={() => null} />
  }
  return <OfficeApp dataSource={activeSession.source} session={activeSession} chatSource={chatSource} decisionOpenToken={decisionOpenToken}
    teamSelection={{ teams: teamOptions, activeId, select, openDecisions, create }} layout={layout} />
}

function DemoApp() {
  const [dataSource] = useState(createOfficeDataSource)
  const [chatSource] = useState(createOfficeChatSource)
  const [directory] = useState(() => dataSource.kind === 'example' ? new DemoOfficeDirectory(dataSource, localStorage) : undefined)
  const [initialTeams] = useState(() => {
    const teams = directory?.list() ?? []
    return teams.length ? teams : [{ id: 'office-1', name: '办公室', sceneLabel: '办公室', source: dataSource }]
  })
  return <OfficeTeamWorkspace initialTeams={initialTeams} createTeam={directory?.create} chatSource={chatSource}
    layout={new URLSearchParams(location.search).get('layout') === 'scene' ? 'scene' : 'full'} />
}

function App() {
  const relayUrl = sceneRelayUrl()
  return relayUrl ? <ConnectedOfficeWorkspace baseUrl={relayUrl} renderOffice={props => <OfficeApp dataSource={props.session.source} {...props} />} /> : <DemoApp />
}

export default App
