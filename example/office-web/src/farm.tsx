import { createRoot } from 'react-dom/client'
import { FarmApp } from '../../farm/src/FarmApp.tsx'
import { sceneRelayUrl } from '../../shared/scene/connectionConfig.ts'
const base = import.meta.env.BASE_URL
const assetBaseUrl = new URL(`${base}farm-assets/`, document.baseURI).href
createRoot(document.getElementById('root')!).render(<FarmApp layout={new URLSearchParams(location.search).get('layout') === 'scene' ? 'scene' : 'full'} assetBaseUrl={assetBaseUrl} homeUrl={base} officeUrl={`${base}office/`} classroomUrl={`${base}classroom/`} relayUrl={sceneRelayUrl()} />)
