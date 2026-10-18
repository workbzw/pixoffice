import { useLayoutEffect, useRef } from 'react'
import type { SceneHost } from './SceneHost.ts'

export function SceneSurface({ host, className }: { host: SceneHost; className?: string }) {
  const surface = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => host.attach(surface.current!), [host])
  return <div className={className} ref={surface} />
}
