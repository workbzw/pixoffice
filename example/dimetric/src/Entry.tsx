import { lazy, Suspense } from 'react'

const Lab = lazy(() => import('./App.tsx'))
const Studio = lazy(() => import('./studio/StudioApp.tsx'))

export default function Entry() {
  const params = new URLSearchParams(location.search)
  return <Suspense fallback={<div style={{ padding: 32, font: '16px system-ui' }}>PixOffice</div>}>
    {params.get('view') === 'lab' ? <Lab /> : <Studio layout={params.get('layout') === 'scene' ? 'scene' : 'full'} />}
  </Suspense>
}
