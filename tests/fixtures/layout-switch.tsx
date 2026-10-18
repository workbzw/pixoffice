import '@vitejs/plugin-react/preamble'
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import StudioApp from '../../example/dimetric/src/studio/StudioApp.tsx'
import type { StudioShellProps } from '../../example/dimetric/src/studio/ui/StudioShell.tsx'

export function AlternateShell({ scene }: StudioShellProps) {
  return <div style={{ height: '100dvh', display: 'grid', gridTemplateRows: '40px minmax(0, 1fr)' }}>
    <header>替换后的应用界面</header>{scene()}
  </div>
}
export function Fixture() {
  const [layout, setLayout] = useState<'full' | 'scene'>('full'), [alternate, setAlternate] = useState(false)
  const first = useRef<HTMLCanvasElement | null>(null)
  const [reused, setReused] = useState('等待场景')
  useEffect(() => {
    const timer = setInterval(() => {
      const canvas = document.querySelector('canvas')
      if (!canvas) return
      first.current ??= canvas
      setReused(canvas === first.current ? '原画布复用' : '画布被重建')
    }, 100)
    return () => clearInterval(timer)
  }, [])
  return <>
    <StudioApp layout={layout} shell={alternate ? AlternateShell : undefined} />
    <div style={{ position: 'fixed', zIndex: 100, right: 8, bottom: 40, background: '#fff', padding: 8 }}>
      <button onClick={() => setLayout(value => value === 'full' ? 'scene' : 'full')}>切换布局</button>
      <button onClick={() => setAlternate(value => !value)}>切换界面</button>
      <output role="status">{reused}</output>
    </div>
  </>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
