import '@vitejs/plugin-react/preamble'
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../example/office-web/src/index.css'
import { OfficeApp } from '../../example/office-web/src/App.tsx'
import { OfficeTeamSession } from '../../example/office-web/src/application/OfficeTeamSession.ts'
import { visitCommand } from '@pixoffice/scene-office/adapters/office'
import { useOfficeTeamHost } from '../../example/office-web/src/controller/useOfficeTeamHost.ts'
import { createOfficeRuntime } from '../../example/office-web/src/application/createOfficeRuntime.ts'
import { ExampleOfficeDataSource } from '../../example/office-web/src/dashboard/demoSource.ts'
import { configureCharacterResources } from '@pixoffice/assets-office/frame/resources'
import { configureOfficeAssets } from '@pixoffice/scene-office/pixi'
import { textureLoadQueue } from '@pixoffice/animation-frame/AssetLoadQueue'

configureCharacterResources('/characters')
configureOfficeAssets({ baseUrl: '/assets/office', schedule: job => textureLoadQueue.run(job) })

export function Fixture() {
  const [teams] = useState(() => ['team-a', 'team-b'].map((id, index) => {
    const name = index ? '后台事件团队 B' : '后台事件团队 A'
    const source = new ExampleOfficeDataSource(new Date(), { workspace: { id, name } })
    const session = new OfficeTeamSession(createOfficeRuntime({ sceneId: id }), {
      kind: 'http', getSnapshot: () => source.getSnapshot(), subscribe: listener => source.subscribe(listener), execute: action => source.execute(action),
    })
    return { id, name, sceneLabel: '办公室', session }
  }))
  const [sessions] = useState(() => teams.map(team => team.session))
  const [activeId, select] = useState('team-a')
  const [lastEvent, setLastEvent] = useState('测试控制台：模拟外部事件，不启用演示调度')
  useOfficeTeamHost(sessions)
  const session = teams.find(team => team.id === activeId)!.session
  return <>
    <OfficeApp dataSource={session.source} session={session} teamSelection={{ teams, activeId, select }} />
    <div style={{ position: 'fixed', zIndex: 100, right: 12, bottom: 8, padding: 8, background: '#fff', border: '1px solid #ccc', borderRadius: 8, fontSize: 12 }}>
      <button onClick={async () => { await teams[0].session.execute({ type: 'task.complete', taskId: 'market-research' }); setLastEvent('已发送 A 的市场调研完成事件') }}>模拟后端完成 A 市场调研</button>
      <button onClick={() => { const runtime = teams[0].session.runtime; runtime.submit(visitCommand(runtime, 1, [2], () => '这是后台接收的交接命令。')); setLastEvent('已发送 A 的交接命令') }}>模拟后端指挥 A 交接</button>
      <output>{lastEvent}</output>
    </div>
  </>
}

const root = createRoot(document.getElementById('root')!)
root.render(<StrictMode><Fixture /></StrictMode>)
import.meta.hot?.dispose(() => root.unmount())
