import type { ComponentType } from 'react'
import { SceneOnlyLayout } from '../../../shared/scene/layout.tsx'
import type { LayoutMode, SceneSlot } from '../../../shared/scene/layout.tsx'
import { useStudioController } from './controller/useStudioController.ts'
import { StudioScene } from './scene/StudioScene.tsx'
import { StudioShell } from './ui/StudioShell.tsx'
import type { StudioShellProps } from './ui/StudioShell.tsx'
import './studio.css'

export interface StudioAppProps { layout?: LayoutMode; shell?: ComponentType<StudioShellProps> }
export default function StudioApp({ layout = 'full', shell: Shell = StudioShell }: StudioAppProps) {
  const controller = useStudioController()
  const scene: SceneSlot = overlay => <StudioScene controller={controller}>{overlay}</StudioScene>
  return layout === 'scene' ? <SceneOnlyLayout>{scene()}</SceneOnlyLayout> : <Shell controller={controller} scene={scene} />
}
