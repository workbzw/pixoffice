import { createRoot } from 'react-dom/client'
import { FarmApp } from './FarmApp.tsx'
import { sceneRelayUrl } from '../../shared/scene/connectionConfig.ts'
const assetBaseUrl = new URL(`${import.meta.env.BASE_URL}farm-assets/`, document.baseURI).href
createRoot(document.getElementById('root')!).render(<FarmApp layout={new URLSearchParams(location.search).get('layout') === 'scene' ? 'scene' : 'full'} assetBaseUrl={assetBaseUrl} relayUrl={sceneRelayUrl()} />)
