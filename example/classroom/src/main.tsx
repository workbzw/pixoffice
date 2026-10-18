import { createRoot } from 'react-dom/client'
import { ClassroomApp } from './ClassroomApp.tsx'
import { sceneRelayUrl } from '../../shared/scene/connectionConfig.ts'
const assetBaseUrl = new URL(`${import.meta.env.BASE_URL}classroom-assets/`, document.baseURI).href
createRoot(document.getElementById('root')!).render(<ClassroomApp layout={new URLSearchParams(location.search).get('layout') === 'scene' ? 'scene' : 'full'} assetBaseUrl={assetBaseUrl} relayUrl={sceneRelayUrl()} />)
