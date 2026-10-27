import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { configureCharacterResources } from '@pixoffice/assets-office/frame/resources'
import { textureLoadQueue } from '@pixoffice/animation-frame/AssetLoadQueue'
import { configureOfficeAssets } from '@pixoffice/scene-office/pixi'
import App from '../App.tsx'
import { createCivicEnvironment, civicEntryUrl } from './environment.ts'
import '../index.css'
import './preview.css'

const candidate = new URLSearchParams(location.search).get('candidate') ?? ''
const preview = import.meta.env.DEV && /^[a-f0-9]{64}$/.test(candidate)
history.replaceState(history.state, '', civicEntryUrl(location.href))
configureCharacterResources(preview ? `${import.meta.env.BASE_URL}.character-preview/${candidate}/characters` : `${import.meta.env.BASE_URL}civic-assets/characters`)
configureOfficeAssets({ baseUrl: `${import.meta.env.BASE_URL}assets/office`, schedule: job => textureLoadQueue.run(job) })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div role="status" className="civic-preview-status">公务场景预览 · 人物动作素材尚未验收</div>
    <App environment={createCivicEnvironment(localStorage)} />
  </StrictMode>,
)
