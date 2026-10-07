import { createRoot } from 'react-dom/client'
import { ClassroomApp } from './ClassroomApp.tsx'
const assetBaseUrl = new URL(`${import.meta.env.BASE_URL}classroom-assets/`, document.baseURI).href
createRoot(document.getElementById('root')!).render(<ClassroomApp assetBaseUrl={assetBaseUrl} gatewayUrl={import.meta.env.VITE_CLASSROOM_GATEWAY_URL} />)
