import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { SseMessageTransport } from '@pixoffice/runtime/adapters/sse'
import { officeIntegrationPaths, officeUiPresentationSchema } from '@pixoffice/protocol/office-integration'
import { responseEnvelopeSchema, stringifyProtocolObject } from '@pixoffice/protocol/schema'
import { OfficeIntegrationSession } from '../application/OfficeIntegrationSession.ts'
import { OfficeTeamSession } from '../application/OfficeTeamSession.ts'
import { createOfficeRuntime } from '../application/createOfficeRuntime.ts'
import { supportsCharacterPose } from '../application/poseSupport.ts'
import { seatStepDurationMs } from '@pixoffice/scene-office/pixi/projection'
import { browserChatPersistence } from '../chat/persistence.ts'
import { createOfficeChatSource } from '../chat/sources.ts'
import { useOfficeTeamHost } from '../controller/useOfficeTeamHost.ts'
import { useOfficeTeamDirectory } from '../controller/useOfficeTeamDirectory.ts'
import type { OfficeTeamSelection } from './TeamSwitcher.tsx'
import type { LayoutMode } from '../../../shared/scene/layout.tsx'
import { OfficeShell } from './OfficeShell.tsx'
import { OfficeEmptyState } from './OfficeEmptyState.tsx'
import { SceneOnlyLayout } from '../../../shared/scene/layout.tsx'

export function ConnectedOfficeWorkspace({ baseUrl, renderOffice }: { baseUrl: string; renderOffice: (props: {
  session: OfficeTeamSession; teamSelection: OfficeTeamSelection; layout: LayoutMode; decisionOpenToken: number; integrationError: string | null
}) => ReactNode }) {
  const [chatSource] = useState(createOfficeChatSource)
  const [integration] = useState(() => new OfficeIntegrationSession({
    transport: new SseMessageTransport(baseUrl), storage: localStorage,
    createSession: (source, sceneId) => new OfficeTeamSession(createOfficeRuntime({ sceneId, referenceLayout: true,
      seatStepDuration: seatStepDurationMs, supportsPose: supportsCharacterPose }), source, { chatSource,
      requestUi: async action => {
        const response = await fetch(`${baseUrl.replace(/\/$/, '')}${officeIntegrationPaths.ui}`, { method: 'POST',
          headers: { 'Content-Type': 'application/json' }, body: stringifyProtocolObject(action), signal: AbortSignal.timeout(65000) })
        const result = responseEnvelopeSchema.parse(await response.json())
        if (result.code !== response.status) throw new Error('用户操作响应格式错误')
        if (!response.ok) throw new Error(`${result.msg}（${result.data?.reasonCode ?? response.status}）`)
        return officeUiPresentationSchema.parse(result.data)
      },
      chatPersistence: browserChatPersistence(sceneId, `connected:${baseUrl}:${chatSource.historyKey ?? chatSource.kind}`) }),
    reply: async value => {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}${officeIntegrationPaths.reply}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: stringifyProtocolObject(value), signal: AbortSignal.timeout(10000),
      })
      if (!response.ok) throw Object.assign(new Error(response.status === 410 ? '请求已结束或超时' : `结果提交失败（${response.status}）`), { status: response.status })
    },
  }))
  const state = useSyncExternalStore(integration.subscribe, integration.getSnapshot)
  const [activeId, select] = useState('')
  const [decisionOpenToken, setDecisionOpenToken] = useState(0)
  const [focusedDecisionTeamId, setFocusedDecisionTeamId] = useState('')
  const selectTeam = (id: string) => { select(id); setFocusedDecisionTeamId('') }
  useEffect(() => { void integration.start(); return () => integration.stop() }, [integration])
  const [layout] = useState<LayoutMode>(() => new URLSearchParams(location.search).get('layout') === 'scene' ? 'scene' : 'full')
  const sessions = useMemo(() => state.offices.map(office => office.session), [state.offices])
  useOfficeTeamHost(sessions)
  const options = useOfficeTeamDirectory(state.offices, sessions)
  const office = state.offices.find(office => office.id === activeId) ?? state.offices[0]
  if (!office) {
    const scene = <OfficeEmptyState message="等待后端初始化办公室" />
    if (layout === 'scene') return <SceneOnlyLayout>{scene}</SceneOnlyLayout>
    return <OfficeShell connection={state.connection} dashboard={null} dashboardError={state.error} sceneLinkError={null} dataMode="push"
      hasOffice={false} canExecuteActions={false} executeAction={async () => { throw new Error('暂无办公室') }} pendingTaskIds={[]} actionError={null}
      appearanceIds={{}} scene={scene} editing={false} canRecoverLayout={false} recoverLayout={() => {}} exportCapabilities={() => {}} exportSnapshot={() => {}} renderScenePanel={() => null} />
  }
  return renderOffice({ session: office.session, layout, decisionOpenToken, integrationError: state.error,
    teamSelection: { teams: options, activeId: office.id, focusedDecisionTeamId, select: selectTeam,
      openDecisions: id => { select(id); setFocusedDecisionTeamId(id); setDecisionOpenToken(value => value + 1) },
      resolveDecision: (teamId, decisionId, choiceId) => { void state.offices.find(item => item.id === teamId)?.session.decisions.choose(teamId, decisionId, choiceId) } } })
}
