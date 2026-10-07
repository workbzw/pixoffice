import { scenePrimitives } from '@pixoffice/runtime'
import type { ScenePack } from '@pixoffice/runtime'
export const demoScenePack: ScenePack = {
  manifest: { id: 'demo.courtyard', version: '1.0.0', apiVersion: 1 },
  plugins: [scenePrimitives, {
    id: 'demo.waypoints', name: 'Waypoints', version: '1.0.0', apiVersion: 1,
    templates: [{ id: 'waypoint', name: 'Waypoint', view: 'waypoint',
      footprint: { left: 0, top: 0, right: 1, bottom: 1 }, anchors: { approach: { x: 0, y: 1 } }, resources: {} }],
  }],
  supportsPose: (_id, posture) => posture === 'standing',
  createWorld(sceneId = 'courtyard') {
    return { sceneId, unit: 'cell', width: 12, height: 8, gridSize: 1, layoutRevision: 0,
      bounds: { left: 0, top: 0, right: 12, bottom: 8 },
      actors: [{ id: 'walker', name: '漫游者', templateId: 'walker', color: 0x4d9878, position: { x: 5, y: 5 },
        facing: 'front', posture: 'standing', presentation: { status: 'idle', title: '', sourceRevision: 0 } }],
      props: [{ id: 'point-a', name: 'A', templateId: 'waypoint', position: { x: 2, y: 2 }, state: {}, stateRevision: 0 },
        { id: 'point-b', name: 'B', templateId: 'waypoint', position: { x: 9, y: 4 }, state: {}, stateRevision: 0 }],
    }
  },
}
