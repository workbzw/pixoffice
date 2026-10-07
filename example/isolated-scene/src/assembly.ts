import { AnimationRegistry, PropViewRegistry, createAppearanceResolver } from '@pixoffice/renderer-pixi'
import type { SceneAssembly, ScenePresentationPack } from '@pixoffice/renderer-pixi'
import { FrameAdapter } from '@pixoffice/animation-frame'
import { Container, Graphics, Text } from 'pixi.js'
import { demoScenePack } from './world.ts'
const size = 64
const cellCenter = (point: { x: number; y: number }) => ({ x: (point.x + .5) * size, y: (point.y + .5) * size })
const presentation: ScenePresentationPack = {
  id: 'demo.courtyard', cellPixels: size, resourceCount: 1, cellCenter,
  loadBackground: async () => null,
  loadObjects: async () => {},
  createPropViews() {
    const registry = new PropViewRegistry(size)
    registry.register('waypoint', prop => {
      const root = new Container(), marker = new Graphics().roundRect(4, 4, size - 8, size - 8, 8).fill(prop.id === 'point-a' ? 0xdceee5 : 0xf4e4d4)
      const label = new Text({ text: prop.name, style: { fontSize: 22, fill: 0x424b46 } })
      label.anchor.set(.5); label.position.set(size / 2, size / 2); root.addChild(marker, label)
      return { roots: [root], hitTarget: root, update(p) { root.position.set(p.position.x * size, p.position.y * size); root.zIndex = p.position.y * size } }
    })
    return registry
  },
  projectActors(runtime, preview) {
    return (preview?.actors ?? runtime.readActors()).map(actor => {
      const step = actor.step, progress = step ? Math.min(1, step.elapsedMs / step.durationMs) : 0
      const position = step ? { x: step.from.x + (step.to.x - step.from.x) * progress, y: step.from.y + (step.to.y - step.from.y) * progress } : actor.position
      const moving = Boolean(step)
      return { id: actor.id, appearanceId: actor.templateId, name: actor.name, position: cellCenter(position), depth: (position.y + .5) * size, displayHeight: 100,
        intent: { actionId: moving ? 'core.walk' : 'core.idle', poseId: 'standing', view: actor.facing },
        status: moving ? 'walking' : 'idle' }
    })
  },
}
export function createAssembly(signal: AbortSignal): SceneAssembly {
  return { scene: demoScenePack, pack: presentation,
    animations: new AnimationRegistry<Container>().register(new FrameAdapter()),
    resolveAppearance: createAppearanceResolver(id => {
      if (id !== 'walker') throw new Error('Unknown appearance')
      return new URL(`${import.meta.env.BASE_URL}walker/visual.json`, document.baseURI).href
    }, signal),
  }
}
