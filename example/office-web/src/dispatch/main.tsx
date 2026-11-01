import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { configureCharacterResources } from '@pixoffice/assets-office/frame/resources'
import { textureLoadQueue } from '@pixoffice/animation-frame/AssetLoadQueue'
import { configureOfficeAssets } from '@pixoffice/scene-office/pixi'
import App from '../App.tsx'
import { createDispatchEnvironment, dispatchEntryUrl } from './environment.ts'
import { DispatchOfficeTools } from './DispatchOfficeTools.tsx'
import '../index.css'
import './DispatchOffice.css'

history.replaceState(history.state, '', dispatchEntryUrl(location.href))
configureCharacterResources(`${import.meta.env.BASE_URL}characters`)
configureOfficeAssets({ baseUrl: `${import.meta.env.BASE_URL}assets/office`, schedule: job => textureLoadQueue.run(job) })

createRoot(document.getElementById('root')!).render(
  <StrictMode><div className="dispatch-office"><App environment={createDispatchEnvironment(localStorage)} workspaceTools={DispatchOfficeTools} /></div></StrictMode>,
)
