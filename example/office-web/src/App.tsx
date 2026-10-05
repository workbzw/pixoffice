import { OfficeActionConnector } from './components/OfficeActionConnector.tsx'
import { useEffect, useState } from 'react'
import { RuntimeWorkspace } from './components/RuntimeWorkspace.tsx'
import { createOfficeRuntime } from './runtime/createOfficeRuntime.ts'
import { browserPersistence } from '@pixoffice/runtime/adapters/storage'
import { RuntimeHttpClient } from '@pixoffice/runtime/adapters/http'
import { attachParentBridge } from '@pixoffice/runtime/adapters/embed'
import { OFFICE_HTTP_ACTIONS_URL } from './config/officeMode.ts'
import { seatStepDurationMs } from './scene/gridProjection.ts'
import { supportsCharacterPose } from './scene/assets/loadApartmentAssets.ts'
import { createOfficeDataSource } from './dashboard/createSource.ts'
import type { OfficeDataSource } from './dashboard/contract.ts'
import { useOfficeDashboard } from './dashboard/useOfficeDashboard.ts'
import { DashboardSceneBridge } from './dashboard/sceneBridge.ts'
import type { OfficeRuntime } from '@pixoffice/runtime/OfficeRuntime'
import type { OfficeChatSource } from './chat/contract.ts'
import { createOfficeChatSource } from './chat/sources.ts'
import './App.css'

export function OfficeApp({ dataSource, runtime: suppliedRuntime, chatSource: suppliedChatSource }: { dataSource: OfficeDataSource; runtime?: OfficeRuntime; chatSource?: OfficeChatSource }) {
  const [defaultChatSource] = useState(createOfficeChatSource)
  const [runtime] = useState(() => suppliedRuntime ?? createOfficeRuntime({ persistence: browserPersistence(localStorage, 'office-1'), seatStepDuration: seatStepDurationMs, supportsPose: supportsCharacterPose }))
  const [bridge] = useState(() => new DashboardSceneBridge(runtime))
  const { snapshot: dashboard, error: dashboardError, execute } = useOfficeDashboard(dataSource)
  const [connection, setConnection] = useState('连接中')
  const [sceneLinkError, setSceneLinkError] = useState<string | null>(null)
  useEffect(() => {
    const client = new RuntimeHttpClient(runtime, new URL(OFFICE_HTTP_ACTIONS_URL).origin, setConnection)
    client.connect()
    const origin = import.meta.env.VITE_OFFICE_PARENT_ORIGIN
    const detach = origin ? attachParentBridge(runtime, origin) : undefined
    return () => { client.disconnect(); detach?.() }
  }, [runtime])
  useEffect(() => {
    if (dashboard) setSceneLinkError(bridge.sync(dashboard).join('；') || null)
  }, [bridge, dashboard])
  return (
    <>
      <OfficeActionConnector />
      <RuntimeWorkspace runtime={runtime} connection={connection} dashboard={dashboard} dashboardError={dashboardError} sceneLinkError={sceneLinkError} dataMode={dataSource.kind} executeAction={execute} chatSource={suppliedChatSource ?? defaultChatSource} />
    </>
  )
}

function App() {
  const [dataSource] = useState(createOfficeDataSource)
  return <OfficeApp dataSource={dataSource} />
}

export default App
