import { Container, Graphics } from 'pixi.js'
import { AnimationRegistry, PropViewRegistry, createDimetricProjection } from '@pixoffice/renderer-pixi'
import type { SceneAssembly, ScenePresentationPack } from '@pixoffice/renderer-pixi'
import { worldDirectionFromFacing } from '@pixoffice/contracts/projection'
import type { SceneProduct } from '@pixoffice/contracts'
import { dimetricScene, mapSize } from './scene.ts'
import { MarkerAdapter, markerManifest } from './appearance.ts'

export const product: SceneProduct = { id: 'pixoffice.dimetric', storageNamespace: 'dimetric-lab', presentationProfileId: 'pixoffice.dimetric-lab.v1' }
export const projection = createDimetricProjection(64)
const points = (p: { x: number; y: number }[]) => p.flatMap(p => [p.x, p.y])
const presentation: ScenePresentationPack = {
  id: 'pixoffice.dimetric-lab', projection, cellPixels: 64, resourceCount: 1,
  rendering: { antialias: false, roundPixels: true, pixelArt: true, backgroundColor: 0xf4f5f5 },
  cellCenter: projection.cellCenter,
  contentBounds(world) {
    const b = projection.bounds({ left: 0, top: 0, right: world.width, bottom: world.height })
    return { left: b.left - 24, right: b.right + 24, top: b.top - 64, bottom: b.bottom + 24 }
  },
  loadBackground: async () => null, loadObjects: async () => {},
  createAmbientViews() {
    const floor = new Graphics()
    for (let y = 0; y < mapSize; y++) for (let x = 0; x < mapSize; x++) {
      floor.poly(points(projection.cellPolygon({ x, y }))).fill((x + y) % 2 ? 0xebeeef : 0xfafafa).stroke({ color: 0xd8dddd, width: .5 })
    }
    floor.zIndex = -10000
    return [{ roots: [floor], update() {} }]
  },
  createPropViews() {
    const registry = new PropViewRegistry(projection)
    for (const kind of ['lab.origin', 'lab.desk', 'lab.block']) registry.register(kind, (_prop, template) => {
      const root = new Container(), shape = new Graphics()
      root.addChild(shape)
      return { roots: [root], hitTarget: root, update(p) {
        const origin = projection.gridToScreen(p.position)
        root.position.set(origin.x, origin.y)
        const b = template.footprint
        // The desk occupies two rows but its tabletop only covers the rear row.
        const polygon = projection.areaPolygon({ ...b, bottom: kind === 'lab.desk' ? 1 : b.bottom })
        const height = kind === 'lab.block' ? 42 : kind === 'lab.desk' ? 24 : 3
        const top = polygon.map(v => ({ x: v.x, y: v.y - height }))
        shape.clear()
        shape.poly(points([polygon[1], polygon[2], top[2], top[1]])).fill(0x9ca9b0)
          .poly(points([polygon[2], polygon[3], top[3], top[2]])).fill(0xb7c1c5)
          .poly(points(top)).fill(kind === 'lab.desk' ? 0xdce8df : 0xd4dce0).stroke({ color: 0x77848b, width: .5 })
        root.zIndex = projection.depth({ x: p.position.x + b.right / 2, y: p.position.y + (kind === 'lab.desk' ? .8 : b.bottom) })
      } }
    })
    return registry
  },
  projectActors(runtime, preview) {
    const phases = runtime.readActivePhases()
    return (preview?.actors ?? runtime.readActors()).map(actor => {
      const step = actor.step, t = step ? Math.min(1, step.elapsedMs / step.durationMs) : 0
      const ground = step ? { x: step.from.x + (step.to.x - step.from.x) * t, y: step.from.y + (step.to.y - step.from.y) * t } : actor.position
      const transition = actor.seatTransition
      const walking = Boolean(step || (transition ? ['entering', 'exiting'].includes(transition.stage) && !transition.waiting : actor.motion && actor.motion.index < actor.motion.path.length && !actor.motion.waiting))
      const phase = phases.find(p => p.participants.includes(actor.id)), seated = actor.posture === 'seated' && !walking
      const working = phase?.ready && phase.actions.some(a => a.actorId === actor.id && a.actionId === 'lab.work')
      const position = projection.cellCenter(ground)
      position.y -= (transition?.seatedAmount ?? (seated ? 1 : 0)) * 8
      return { id: actor.id, appearanceId: actor.templateId, name: actor.name, position,
        depth: projection.depth({ x: ground.x + .5, y: ground.y + .5 }), displayHeight: 32,
        locomotion: { position: ground, strideCells: 1 },
        intent: { actionId: walking ? 'core.walk' : working ? 'lab.work' : 'core.idle', poseId: seated ? 'seated' : 'standing', view: projection.viewDirection(worldDirectionFromFacing(actor.facing)) },
        status: walking ? 'walking' : working ? 'working' : 'idle',
      }
    })
  },
}
export function createDimetricAssembly(): SceneAssembly {
  return { product, scene: dimetricScene, pack: presentation, animations: new AnimationRegistry<Container>().register(new MarkerAdapter()),
    resolveAppearance: async id => {
      if (id !== markerManifest.asset.id) throw new Error(`Unknown appearance: ${id}`)
      return markerManifest
    },
  }
}
