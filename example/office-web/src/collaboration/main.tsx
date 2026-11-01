import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { configureCharacterResources } from '@pixoffice/assets-office/frame/resources'
import { textureLoadQueue } from '@pixoffice/animation-frame/AssetLoadQueue'
import { configureOfficeAssets } from '@pixoffice/scene-office/pixi'
import App from '../App.tsx'
import { collaborationEntryUrl, createCollaborationEnvironment } from './environment.ts'
import '../index.css'

history.replaceState(history.state, '', collaborationEntryUrl(location.href))
configureCharacterResources(`${import.meta.env.BASE_URL}characters`)
configureOfficeAssets({ baseUrl: `${import.meta.env.BASE_URL}assets/office`, schedule: job => textureLoadQueue.run(job) })

createRoot(document.getElementById('root')!).render(
  <StrictMode><App environment={createCollaborationEnvironment(localStorage)} /></StrictMode>,
)
