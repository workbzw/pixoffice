import '@vitejs/plugin-react/preamble'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../example/office-web/src/index.css'
import { OfficeTeamWorkspace } from '../../example/office-web/src/App.tsx'
import { ExampleOfficeDataSource } from '../../example/office-web/src/dashboard/demoSource.ts'
import { configureCharacterResources } from '@pixoffice/assets-office/frame/resources'
import { configureOfficeAssets } from '@pixoffice/scene-office/pixi'
import { textureLoadQueue } from '@pixoffice/animation-frame/AssetLoadQueue'

configureCharacterResources('/characters')
configureOfficeAssets({ baseUrl: '/assets/office', schedule: job => textureLoadQueue.run(job) })
const params = new URLSearchParams(location.search)
const fail = params.has('fail')
const count = Math.min(20, Math.max(0, Math.floor(Number(params.get('count')) || 0)))
const initialTeams = Array.from({ length: count }, (_, index) => {
  const id = `office-fixture-initial-${index + 1}`, name = `办公室 ${index + 1}`
  return { id, name, sceneLabel: '办公室', source: new ExampleOfficeDataSource(new Date(), { workspace: { id, name }, tasks: [] }) }
})
const root = createRoot(document.getElementById('root')!)
root.render(<StrictMode><OfficeTeamWorkspace initialTeams={initialTeams} chatSource={{ kind: 'preview', async *stream() {} }}
  createTeam={async ({ name }) => {
    if (fail) throw new Error('创建失败，请稍后重试')
    const id = `office-fixture-${crypto.randomUUID()}`
    return { id, name, sceneLabel: '办公室', source: new ExampleOfficeDataSource(new Date(), { workspace: { id, name }, tasks: [] }) }
  }} /></StrictMode>)
import.meta.hot?.dispose(() => root.unmount())
