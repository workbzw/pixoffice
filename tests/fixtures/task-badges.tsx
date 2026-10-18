import '@vitejs/plugin-react/preamble'
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../example/office-web/src/index.css'
import { OfficeApp } from '../../example/office-web/src/App.tsx'
import { OfficeTeamSession } from '../../example/office-web/src/application/OfficeTeamSession.ts'
import { createOfficeRuntime } from '../../example/office-web/src/application/createOfficeRuntime.ts'
import { useOfficeTeamHost } from '../../example/office-web/src/controller/useOfficeTeamHost.ts'
import { ExampleOfficeDataSource } from '../../example/office-web/src/dashboard/demoSource.ts'
import { configureCharacterResources } from '@pixoffice/assets-office/frame/resources'
import { configureOfficeAssets } from '@pixoffice/scene-office/pixi'
import { textureLoadQueue } from '@pixoffice/animation-frame/AssetLoadQueue'

configureCharacterResources('/characters')
configureOfficeAssets({ baseUrl: '/assets/office', schedule: job => textureLoadQueue.run(job) })

export function Fixture() {
  const [sessions] = useState(() => {
    const id = 'task-badges-preview'
    const source = new ExampleOfficeDataSource(new Date(), { workspace: { id, name: '任务状态预览' }, tasks: [
      { id: 'preview-running', title: '登录模块开发', assigneeId: 'office-lead', status: 'running', summary: '实现登录与权限校验。' },
      { id: 'preview-completed', title: '测试报告', assigneeId: 'app-agent', status: 'completed', progress: 100, summary: '测试通过，报告已生成。' },
    ] })
    return [new OfficeTeamSession(createOfficeRuntime({ sceneId: id, referenceLayout: true }), {
      kind: 'fixture', getSnapshot: () => source.getSnapshot(), subscribe: listener => source.subscribe(listener), execute: action => source.execute(action),
    }, { chatSource: { kind: 'preview', async *stream() {} } })]
  })
  useOfficeTeamHost(sessions)
  return <OfficeApp dataSource={sessions[0].source} session={sessions[0]} />
}

const root = createRoot(document.getElementById('root')!)
root.render(<StrictMode><Fixture /></StrictMode>)
import.meta.hot?.dispose(() => root.unmount())
