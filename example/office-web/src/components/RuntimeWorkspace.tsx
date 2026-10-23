import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { OfficeUiSession } from '../application/OfficeUiSession.ts'
import { OfficeUiPanel } from '../ui/OfficeUiPanel.tsx'
import type { ComponentType } from 'react'
import type { DashboardAction, DashboardSnapshot, OfficeDataSource, OfficeMemberInput } from '@pixoffice/protocol/dashboard'
import { stringifyDocumentObject } from '@pixoffice/protocol/schema'
import type { SceneRuntime } from '@pixoffice/runtime/SceneRuntime'
import type { ChatWorkspace } from '../chat/ChatWorkspace.ts'
import type { DecisionSession } from '../application/decisions/DecisionSession.ts'
import type { OfficeSimulation } from '../application/OfficeSimulation.ts'
import { OfficeCanvas } from './OfficeCanvas.tsx'
import { OfficeChat } from './OfficeChat.tsx'
import { SceneControlPanel } from './SceneControlPanel.tsx'
import { initialMapView } from './map-editor/commands.ts'
import { useOfficeSceneController } from '../controller/useOfficeSceneController.ts'
import { OfficeShell } from '../ui/OfficeShell.tsx'
import type { OfficeShellProps } from '../ui/OfficeShell.tsx'
import type { OfficeTeamSelection } from '../ui/TeamSwitcher.tsx'
import { OfficeSceneControls } from '../ui/OfficeSceneControls.tsx'
import { SceneOnlyLayout } from '../../../shared/scene/layout.tsx'
import type { LayoutMode } from '../../../shared/scene/layout.tsx'
import type { WhiteboardProgress } from '@pixoffice/scene-office/whiteboard'
import { MemberOfficeShell } from '../ui/MemberOfficeShell.tsx'
import { OfficeLayoutSwitch } from '../ui/OfficeLayoutSwitch.tsx'
import { readOfficeShell, saveOfficeShell } from '../ui/officeLayout.ts'
import type { OfficeLayoutControl } from '../ui/officeLayout.ts'
import type { OfficeLayoutId } from '@pixoffice/protocol/office-integration'
import { employeeForActor } from '../dashboard/memberSelectors.ts'

function download(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([stringifyDocumentObject(value, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url)
}

export function RuntimeWorkspace({ runtime, simulation, whiteboardProgress, connection, dashboard, dashboardError, sceneLinkError, dataMode, canExecuteActions = true, executeAction, createEmployee, memberCreation, pendingTaskIds, actionError, chatSession, decisionSession, uiSession, decisionOpenToken = 0, teamSelection, layout = 'full', pageLayout, shell: suppliedShell }: {
  simulation?: OfficeSimulation
  whiteboardProgress?: WhiteboardProgress
  teamSelection?: OfficeTeamSelection
  runtime: SceneRuntime
  connection: string
  dashboard: DashboardSnapshot | null
  dashboardError: string | null
  sceneLinkError: string | null
  dataMode: OfficeDataSource['kind']
  canExecuteActions?: boolean
  executeAction: (action: DashboardAction) => Promise<void>
  createEmployee?: (input: OfficeMemberInput) => Promise<void>
  memberCreation?: { blockedReason: string; availableActorIds: readonly string[] }
  pendingTaskIds: readonly string[]
  actionError: string | null
  chatSession: ChatWorkspace
  decisionSession: DecisionSession
  uiSession?: OfficeUiSession
  decisionOpenToken?: number
  layout?: LayoutMode
  pageLayout?: OfficeLayoutControl
  shell?: ComponentType<OfficeShellProps>
}) {
  const revision = useSyncExternalStore(runtime.subscribe, runtime.getRevision)
  const snapshot = useMemo(() => { void revision; return runtime.snapshot() }, [runtime, revision])
  const [mapView, setMapView] = useState(initialMapView)
  const [chatExpanded, setChatExpanded] = useState(false)
  const [teamPickerOpen, setTeamPickerOpen] = useState(false)
  const [officeSwitcherTarget, setOfficeSwitcherTarget] = useState<HTMLDivElement | null>(null)
  const [shellKind, setShellKind] = useState(readOfficeShell)
  const [selection, setSelection] = useState({ teamId: '', employeeId: '' })
  const employees = dashboard?.employees ?? []
  const selectedEmployee = employees.find(employee => selection.teamId === runtime.sceneId && employee.id === selection.employeeId) ?? employees[0]
  const selectedLayout = pageLayout?.value ?? shellKind
  const memberLayout = layout === 'full' && !suppliedShell && selectedLayout === 'members'
  const Shell = suppliedShell ?? (memberLayout ? MemberOfficeShell : OfficeShell)
  const selectEmployee = useCallback((employeeId: string) => setSelection({ teamId: runtime.sceneId, employeeId }), [runtime])
  const selectActor = useCallback((actorId: string) => {
    if (!memberLayout) return false
    const employee = employeeForActor(dashboard, actorId, selectedEmployee?.id)
    if (!employee) return false
    selectEmployee(employee.id)
    return true
  }, [dashboard, memberLayout, selectEmployee, selectedEmployee?.id])
  const changeShell = (kind: OfficeLayoutId) => {
    if (pageLayout) pageLayout.onChange(kind)
    else { setShellKind(kind); saveOfficeShell(kind) }
  }
  useEffect(() => { setChatExpanded(false) }, [runtime, decisionOpenToken])
  const covered = layout === 'full' && chatExpanded && !snapshot.editor
  const inspectActor = useCallback((actorId: string) => { void uiSession?.request({ action: 'actor.inspect', actorId }).catch(() => {}) }, [uiSession])
  const inspectEmployee = useCallback((employeeId: string) => { void uiSession?.request({ action: 'employee.inspect', employeeId }).catch(() => {}) }, [uiSession])
  const controller = useOfficeSceneController(runtime, covered || teamPickerOpen, simulation, dashboard, uiSession?.enabled ? inspectActor : undefined, whiteboardProgress, uiSession?.enabled ? inspectEmployee : undefined, selectActor, !memberLayout)
  useEffect(() => {
    controller.sceneRef.current?.selectActor(memberLayout ? selectedEmployee?.sceneActorId : undefined)
  }, [memberLayout, selectedEmployee?.sceneActorId, controller.loaded, controller.sceneRef, runtime])
  const canvas = <OfficeCanvas controller={controller} editing={!!snapshot.editor} catalogOpen={mapView.catalogOpen}
    dashboard={dashboard} example={dataMode === 'example'} actors={snapshot.world.actors} canShowActions={layout !== 'scene' || uiSession?.enabled === true}>
    {layout === 'full' && <OfficeSceneControls runtime={runtime} controller={controller} mapView={mapView} setMapView={setMapView}
      teamSelection={teamSelection} teamName={dashboard?.workspace.name} onTeamPickerOpenChange={setTeamPickerOpen}
      teamSwitcherTarget={memberLayout ? officeSwitcherTarget : undefined} />}
  </OfficeCanvas>
  if (layout === 'scene') return <SceneOnlyLayout>{canvas}{uiSession && <OfficeUiPanel session={uiSession} />}</SceneOnlyLayout>
  const appearanceIds = Object.fromEntries(snapshot.world.actors.map(actor => [actor.id, actor.templateId]))
  const leader = snapshot.world.actors.find(actor => actor.id === employees[0]?.sceneActorId) ?? snapshot.world.actors[0]
  return <Shell key={runtime.sceneId} connection={connection} dashboard={dashboard} dashboardError={dashboardError} sceneLinkError={sceneLinkError}
    pendingTaskIds={pendingTaskIds} actionError={actionError} appearanceIds={appearanceIds}
    dataMode={dataMode} canExecuteActions={canExecuteActions} executeAction={executeAction} editing={!!snapshot.editor} persistenceError={snapshot.persistenceError}
    onInspectEmployee={uiSession?.enabled ? inspectEmployee : undefined}
    createEmployee={createEmployee} memberCreationBlockReason={memberCreation?.blockedReason}
    memberActors={snapshot.world.actors.filter(actor => memberCreation ? memberCreation.availableActorIds.includes(actor.id) : !employees.some(employee => employee.sceneActorId === actor.id)).map(actor => ({ id: actor.id, name: actor.name }))}
    layoutControl={!suppliedShell && <OfficeLayoutSwitch value={selectedLayout} onChange={changeShell} disabled={pageLayout?.busy} />}
    officeSwitcherRef={memberLayout ? setOfficeSwitcherTarget : undefined} selectedEmployeeId={selectedEmployee?.id} onSelectEmployee={selectEmployee}
    canRecoverLayout={snapshot.canRecoverLayout} recoverLayout={() => runtime.recoverLayout()}
    exportCapabilities={() => download(runtime.describe(), 'scene-capabilities.json')}
    exportSnapshot={() => download(runtime.snapshot(), 'scene-snapshot.json')}
    renderScenePanel={panel => <SceneControlPanel key={runtime.sceneId} runtime={runtime} snapshot={snapshot} panel={panel} />}
    scene={<main className={`office-main${snapshot.world.props.some(prop => prop.templateId === 'office.wall-whiteboard') && !snapshot.editor ? ' office-main-reference' : ''}`} aria-label="PixOffice 场景">
      <div className="office-stage" inert={covered}>{canvas}</div>
      {uiSession && <OfficeUiPanel session={uiSession} />}
      <OfficeChat key={runtime.sceneId} session={chatSession} expanded={covered} onExpandedChange={setChatExpanded} hidden={!!snapshot.editor}
        decisionSession={decisionSession} decisionOpenToken={decisionOpenToken}
        decisionPreview={dataMode === 'example' && chatSession.source.kind === 'preview'}
        onReplayDemo={dataMode === 'example' && simulation ? () => { simulation.setDemo(false); simulation.setDemo(true) } : undefined}
        leaderAppearanceId={leader?.templateId}
        leaderName={employees[0]?.name ?? leader?.name ?? '办公室负责人'} />
    </main>} />
}
