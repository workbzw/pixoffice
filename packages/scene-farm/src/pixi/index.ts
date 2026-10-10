import { Assets, Container, Graphics, Text } from 'pixi.js'
import type { Texture } from 'pixi.js'
import { PropViewRegistry } from '@pixoffice/renderer-pixi'
import type { ScenePresentationPack } from '@pixoffice/renderer-pixi'
import { createFarmPlotView, FARM_PLOT_LAYOUT } from './plotView.ts'
import { createFarmChickenView } from './chickenView.ts'
import type { FarmChickenAtlas } from './chickenView.ts'

const CELL = 50
export function createFarmPresentation(assetBaseUrl: string, now: () => number): ScenePresentationPack {
  const textures = new Map<string, Texture>(), url = (file: string) => new URL(file, assetBaseUrl).href
  let chickens: FarmChickenAtlas
  return { id: 'pixoffice.farm', cellPixels: CELL, resourceCount: 14,
    cellCenter: p => ({ x: (p.x + .5) * CELL, y: (p.y + .5) * CELL }),
    loadBackground: () => Assets.load<Texture>(url('background.webp')),
    async loadObjects(report) {
      const files = ['soil', 'plot-sign', ...['carrot', 'tomato', 'cabbage'].flatMap(crop => [1, 2, 3].map(stage => `plant-${crop}-${stage}`))]
      await Promise.all(files.map(async key => { textures.set(key, await Assets.load<Texture>(url(`${key}.webp`))); report(key) }))
      await Promise.all([
        Assets.load<Texture>(url('chickens.webp')).then(texture => { textures.set('chickens', texture); report('chickens') }),
        Assets.load<FarmChickenAtlas>(url('chickens.json')).then(data => { chickens = data; report('chicken-clips') }),
      ])
    },
    createAmbientViews(runtime) { return [createFarmChickenView(textures.get('chickens')!, chickens, runtime, now, CELL)] },
    createPropViews() {
      const registry = new PropViewRegistry(CELL)
      registry.register('farm.plot', () => createFarmPlotView(textures, now))
      registry.register('farm.store', () => {
        const root = new Container(), box = new Graphics(), label = new Text({ text: '收获箱', style: { fontFamily: 'sans-serif', fontSize: 13, fill: 0x445f4e, fontWeight: '600' } })
        box.roundRect(4, -14, 82, 46, 3).fill(0xd8b37e).stroke({ color: 0xb28c58, width: 2 })
          .rect(8, -5, 74, 4).fill(0xc29a64).rect(8, 10, 74, 3).fill(0xc29a64)
        label.anchor.set(.5, 0); label.position.set(45, 40); root.addChild(box, label)
        return { roots: [root], hitTarget: box, update(prop) { root.position.set(prop.position.x * CELL, prop.position.y * CELL); root.zIndex = (prop.position.y + 1) * CELL } }
      })
      return registry
    },
    projectActors(runtime, preview) {
      const phases = runtime.readActivePhases()
      return (preview?.actors ?? runtime.readActors()).map(actor => {
        const step = actor.step, motion = actor.motion
        const walking = Boolean(step || motion && !motion.waiting && motion.index < motion.path.length)
        const phase = phases.find(p => p.participants.includes(actor.id)), action = phase?.ready ? phase.actions.find(a => a.actorId === actor.id) : undefined
        const progress = step ? Math.min(1, step.elapsedMs / step.durationMs) : 0
        const point = step ? { x: step.from.x + (step.to.x - step.from.x) * progress, y: step.from.y + (step.to.y - step.from.y) * progress } : actor.position
        return { id: actor.id, name: actor.name, appearanceId: actor.templateId, position: { x: (point.x + .5) * CELL, y: (point.y + .5) * CELL }, depth: (point.y + .5) * CELL,
          displayHeight: 112 * FARM_PLOT_LAYOUT.scale, status: walking ? 'walking' : action ? 'working' : 'idle', title: phase?.title,
          intent: { actionId: walking ? 'core.walk' : action?.actionId ?? 'core.idle', poseId: 'standing', view: walking ? actor.facing : action ? 'back' : actor.facing,
            ...(action && !walking ? { progress: phase!.progress } : {}) } }
      })
    },
  }
}
