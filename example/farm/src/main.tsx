import { createRoot } from 'react-dom/client'
import { FarmApp } from './FarmApp.tsx'
const assetBaseUrl = new URL(`${import.meta.env.BASE_URL}farm-assets/`, document.baseURI).href
createRoot(document.getElementById('root')!).render(<FarmApp assetBaseUrl={assetBaseUrl} gatewayUrl={import.meta.env.VITE_FARM_GATEWAY_URL} />)
