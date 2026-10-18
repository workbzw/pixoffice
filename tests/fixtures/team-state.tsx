import '@vitejs/plugin-react/preamble'
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../example/office-web/src/index.css'
import { OfficeApp } from '../../example/office-web/src/App.tsx'
import { OfficeTeamSession } from '../../example/office-web/src/application/OfficeTeamSession.ts'
import { useOfficeTeamHost } from '../../example/office-web/src/controller/useOfficeTeamHost.ts'
import { useOfficeTeamDirectory } from '../../example/office-web/src/controller/useOfficeTeamDirectory.ts'
import { ExampleOfficeDataSource } from '../../example/office-web/src/dashboard/demoSource.ts'
import { browserChatPersistence } from '../../example/office-web/src/chat/persistence.ts'
import { referenceOfficeScenePack } from '@pixoffice/scene-office/core'
import { SceneRuntime } from '@pixoffice/runtime/SceneRuntime'
import { GridNavigation } from '@pixoffice/runtime/navigation'
import { configureCharacterResources } from '@pixoffice/assets-office/frame/resources'
import { configureOfficeAssets } from '@pixoffice/scene-office/pixi'
import { textureLoadQueue } from '@pixoffice/animation-frame/AssetLoadQueue'

configureCharacterResources('/characters')
configureOfficeAssets({ baseUrl: '/assets/office', schedule: job => textureLoadQueue.run(job) })

const pendingActions = new Map<string, { resolve: () => void; reject: (error: Error) => void }>()
const pendingReplies = new Map<string, () => void>()
const historyKey = 'nine-fixes-regression'
const chatSource = { kind: 'fixture', historyKey, async *stream(request: { teamId: string }, signal: AbortSignal) {
  yield { type: 'delta' as const, text: `reply:${request.teamId}:first` }
  await new Promise<void>(resolve => { pendingReplies.set(request.teamId, resolve); signal.addEventListener('abort', () => resolve(), { once: true }) })
  if (signal.aborted) return
  yield { type: 'delta' as const, text: ':complete' }
  yield { type: 'done' as const }
} }

export function Fixture() {
  const [teams] = useState(() => ['regression-a', 'regression-b'].map((id, index) => {
    const name = index ? 'Regression B' : 'Regression A'
    const world = referenceOfficeScenePack.createWorld(id)
    world.actors[0].templateId = 'file-agent'
    const runtime = new SceneRuntime({ world, plugins: [...referenceOfficeScenePack.plugins], createNavigation: templates => new GridNavigation(templates) })
    const original = new ExampleOfficeDataSource(new Date(), { workspace: { id, name } })
    const session = new OfficeTeamSession(runtime, {
      kind: 'fixture', getSnapshot: () => original.getSnapshot(), subscribe: listener => original.subscribe(listener),
      async execute(action) {
        await new Promise<void>((resolve, reject) => pendingActions.set(`${id}:${action.taskId}`, { resolve, reject }))
        await original.execute(action)
      },
    }, { chatSource, chatPersistence: browserChatPersistence(id, historyKey) })
    return { id, name, sceneLabel: 'Office', session }
  }))
  const [sessions] = useState(() => teams.map(team => team.session))
  const [activeId, select] = useState('regression-a')
  useOfficeTeamHost(sessions)
  const options = useOfficeTeamDirectory(teams, sessions)
  const current = teams.find(team => team.id === activeId)!.session
  return <>
    <OfficeApp dataSource={current.source} session={current} teamSelection={{ teams: options, activeId, select }} />
    <div style={{ position: 'fixed', zIndex: 100, left: 8, bottom: 8, display: 'flex', gap: 8, background: 'white', padding: 8 }}>
      <button onClick={() => pendingActions.get('regression-a:market-research')?.resolve()}>Resolve first action</button>
      <button onClick={() => pendingActions.get('regression-a:report')?.reject(new Error('Regression A action failed'))}>Reject second action</button>
      <button onClick={() => pendingReplies.get('regression-a')?.()}>Complete A reply</button>
    </div>
  </>
}

const root = createRoot(document.getElementById('root')!)
root.render(<StrictMode><Fixture /></StrictMode>)
import.meta.hot?.dispose(() => root.unmount())
