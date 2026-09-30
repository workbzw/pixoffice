import { OfficeActionConnector } from '@/components/OfficeActionConnector'
import { useEffect, useState } from 'react'
import { RuntimeWorkspace } from '@/components/RuntimeWorkspace'
import { createOfficeRuntime } from '@/runtime/createOfficeRuntime'
import { browserPersistence } from '@/runtime/adapters/storage'
import { RuntimeHttpClient } from '@/runtime/adapters/http'
import { attachParentBridge } from '@/runtime/adapters/embed'
import { OFFICE_HTTP_ACTIONS_URL } from '@/config/officeMode'
import { seatStepDurationMs } from '@/scene/gridProjection'
import { supportsCharacterPose } from '@/scene/assets/loadApartmentAssets'
import { createOfficeDataSource } from '@/dashboard/createSource'
import type { OfficeDataSource } from '@/dashboard/contract'
import { useOfficeDashboard } from '@/dashboard/useOfficeDashboard'
import { DashboardSceneBridge } from '@/dashboard/sceneBridge'
import type { OfficeRuntime } from '@/runtime/OfficeRuntime'
import './App.css'

export function OfficeApp({ dataSource, runtime: suppliedRuntime }: { dataSource: OfficeDataSource; runtime?: OfficeRuntime }) {
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
      <RuntimeWorkspace runtime={runtime} connection={connection} dashboard={dashboard} dashboardError={dashboardError} sceneLinkError={sceneLinkError} dataMode={dataSource.kind} executeAction={execute} />
    </>
  )
}

function App() {
  const [dataSource] = useState(createOfficeDataSource)
  return <OfficeApp dataSource={dataSource} />
}

export default App
