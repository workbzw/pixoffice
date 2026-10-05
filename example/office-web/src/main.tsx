import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { configureCharacterResources } from '@pixoffice/animation-frame'
import { textureLoadQueue } from '@pixoffice/animation-frame/AssetLoadQueue'
import { configureOfficeAssets } from '@pixoffice/scene-office/pixi'

configureCharacterResources(`${import.meta.env.BASE_URL}characters`)
configureOfficeAssets({ baseUrl: `${import.meta.env.BASE_URL}assets/office`, schedule: job => textureLoadQueue.run(job) })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
