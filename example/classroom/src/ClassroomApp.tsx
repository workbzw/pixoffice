import type { ComponentType } from 'react'
import { useClassroomController } from './controller/useClassroomController.ts'
import { ClassroomScene } from './scene/ClassroomScene.tsx'
import { ClassroomShell } from './ui/ClassroomShell.tsx'
import type { ClassroomShellProps } from './ui/ClassroomShell.tsx'
import { SceneOnlyLayout } from '../../shared/scene/layout.tsx'
import type { LayoutMode, SceneSlot } from '../../shared/scene/layout.tsx'
import './classroom.css'

export interface ClassroomAppProps { assetBaseUrl: string; homeUrl?: string; officeUrl?: string; relayUrl?: string; layout?: LayoutMode; shell?: ComponentType<ClassroomShellProps> }
export function ClassroomApp({ layout = 'full', shell: Shell = ClassroomShell, ...options }: ClassroomAppProps) {
  const controller = useClassroomController(options)
  const scene: SceneSlot = overlay => <ClassroomScene controller={controller}>{overlay}</ClassroomScene>
  return layout === 'scene' ? <SceneOnlyLayout>{scene()}</SceneOnlyLayout> : <Shell {...options} controller={controller} scene={scene} />
}
