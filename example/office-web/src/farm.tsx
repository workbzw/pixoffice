import { createRoot } from 'react-dom/client'
import { FarmApp } from '../../farm/src/FarmApp.tsx'
const base = import.meta.env.BASE_URL
const assetBaseUrl = new URL(`${base}farm-assets/`, document.baseURI).href
createRoot(document.getElementById('root')!).render(<FarmApp assetBaseUrl={assetBaseUrl} homeUrl={base} officeUrl={`${base}office/`} classroomUrl={`${base}classroom/`} gatewayUrl={import.meta.env.VITE_FARM_GATEWAY_URL} />)
