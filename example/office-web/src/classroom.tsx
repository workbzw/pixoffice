import { createRoot } from 'react-dom/client'
import { ClassroomApp } from '../../classroom/src/ClassroomApp.tsx'
import { sceneRelayUrl } from '../../shared/scene/connectionConfig.ts'
const base = import.meta.env.BASE_URL
const assetBaseUrl = new URL(`${base}classroom-assets/`, document.baseURI).href
createRoot(document.getElementById('root')!).render(<ClassroomApp layout={new URLSearchParams(location.search).get('layout') === 'scene' ? 'scene' : 'full'} assetBaseUrl={assetBaseUrl} homeUrl={base} officeUrl={`${base}office/`} relayUrl={sceneRelayUrl()} />)
