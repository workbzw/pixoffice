import { createRoot } from 'react-dom/client'
import { ClassroomApp } from '../../classroom/src/ClassroomApp.tsx'
const base = import.meta.env.BASE_URL
const assetBaseUrl = new URL(`${base}classroom-assets/`, document.baseURI).href
createRoot(document.getElementById('root')!).render(<ClassroomApp assetBaseUrl={assetBaseUrl} homeUrl={base} officeUrl={`${base}office/`} gatewayUrl={import.meta.env.VITE_CLASSROOM_GATEWAY_URL} />)
