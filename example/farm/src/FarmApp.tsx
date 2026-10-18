import type { ComponentType } from 'react'
import { useFarmController } from './controller/useFarmController.ts'
import { FarmScene } from './scene/FarmScene.tsx'
import { FarmShell } from './ui/FarmShell.tsx'
import type { FarmShellProps } from './ui/FarmShell.tsx'
import { SceneOnlyLayout } from '../../shared/scene/layout.tsx'
import type { LayoutMode, SceneSlot } from '../../shared/scene/layout.tsx'
import './farm.css'

export type FarmAppProps = { assetBaseUrl: string; homeUrl?: string; officeUrl?: string; classroomUrl?: string; relayUrl?: string } & { layout?: LayoutMode; shell?: ComponentType<FarmShellProps> }
export function FarmApp({ layout = 'full', shell: Shell = FarmShell, ...options }: FarmAppProps) {
  const controller = useFarmController(options)
  const scene: SceneSlot = overlay => <FarmScene controller={controller}>{overlay}</FarmScene>
  return layout === 'scene' ? <SceneOnlyLayout className="farm-app">{scene()}</SceneOnlyLayout> : <Shell {...options} controller={controller} scene={scene} />
}
