import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js'
import type { SceneAmbientView } from '@pixoffice/renderer-pixi'
import type { SceneReadPort } from '@pixoffice/runtime'
import { createFarmFlock } from '../core/chickens.ts'

const PECK_FRAMES = [1, 2, 2, 1, 2, 1]

export type FarmChickenAtlas = {
  canvas: { width: number; height: number }
  pivot: { x: number; y: number }
  clips: Record<string, { x: number; y: number; width: number; height: number }[]>
}
export function createFarmChickenView(atlas: Texture, manifest: FarmChickenAtlas, runtime: SceneReadPort, now: () => number, cellPixels: number): SceneAmbientView {
  const flock = createFarmFlock(runtime.readWorld(), runtime)
  const clips = new Map(Object.entries(manifest.clips).map(([id, frames]) => [id, frames.map(frame => new Texture({ source: atlas.source, frame: new Rectangle(frame.x, frame.y, frame.width, frame.height) }))]))
  const roots = flock.read().map((_, i) => {
    const root = new Container(), shadow = new Graphics().ellipse(0, -1, 18, 5).fill({ color: 0x405332, alpha: .12 }), sprite = new Sprite(clips.get('walk.front')![0])
    root.eventMode = 'none'; root.label = `farm-chicken-${i + 1}`
    sprite.anchor.set(manifest.pivot.x / manifest.canvas.width, manifest.pivot.y / manifest.canvas.height)
    sprite.scale.set(80 / manifest.canvas.height); if (i) sprite.tint = 0xffe5bd
    root.addChild(shadow, sprite)
    return root
  })
  let previousTime = now()
  return { roots,
    update(elapsedSeconds, world) {
      const time = now()
      // Revision notifications repaint with dt=0; they must not consume the host clock.
      if (elapsedSeconds > 0) {
        if (time > previousTime) flock.tick(elapsedSeconds * 1000, world)
        previousTime = time
      }
      for (const [i, chicken] of flock.read().entries()) {
        const root = roots[i], sprite = root.children[1] as Sprite
        const facing = chicken.facing === 'right' ? 'left' : chicken.facing
        const clip = clips.get(`${chicken.mode === 'walk' ? 'walk' : 'peck'}.${facing}`)!
        const frame = chicken.mode === 'peck'
          ? PECK_FRAMES[Math.floor((chicken.elapsedMs + i * 220) / 220) % PECK_FRAMES.length]
          : Math.floor(chicken.elapsedMs / 190) % clip.length
        sprite.texture = clip[frame]; sprite.scale.x = Math.abs(sprite.scale.x) * (chicken.facing === 'right' ? -1 : 1)
        root.visible = chicken.visible; root.position.set((chicken.position.x + .5) * cellPixels, (chicken.position.y + .5) * cellPixels)
        root.zIndex = root.y
      }
    },
    dispose() { for (const frames of clips.values()) for (const frame of frames) frame.destroy() },
  }
}
