import { Application, Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js'
import type { StudioEngine } from '../engine.ts'
import { assetUrl, workers } from '../data.ts'
import type { WorkerId } from '../data.ts'
import { boardBox, project, roomSize, stationPoint } from '../geometry.ts'

export function mountStudioView(host: HTMLElement, { engine, onReady, onChange, onWorker, onError }: {
  engine: StudioEngine; onReady: (engine: StudioEngine) => void; onChange: () => void;
  onWorker: (id: WorkerId) => void; onError: (message: string) => void
}) {
    let disposed = false, app: Application | undefined, observer: ResizeObserver | undefined
    const sprites: Texture[] = []
    void (async () => {
      const mounted = new Application()
      await mounted.init({ width: 1536, height: 1024, backgroundAlpha: 0, antialias: true, resolution: Math.min(devicePixelRatio || 1, 2), autoDensity: true })
      if (disposed) { mounted.destroy(true, { children: true }); return }
      app = mounted
      mounted.ticker.maxFPS = 30
      const textures = await Assets.load<Texture>(['room', 'stations', 'board', 'robot'].map(assetUrl))
      if (disposed) return
      const room = new Sprite(textures[assetUrl('room')]); room.width = roomSize.width; room.height = roomSize.height
      const world = new Container(), layer = new Container(); layer.sortableChildren = true
      world.addChild(room, layer); mounted.stage.addChild(world)
      host.appendChild(mounted.canvas)
      const stationSheet = textures[assetUrl('stations')], robotSheet = textures[assetUrl('robot')]
      for (const worker of workers) {
        const frame = new Texture({ source: stationSheet.source, frame: new Rectangle(worker.sprite % 3 * 512, Math.floor(worker.sprite / 3) * 512, 512, 512) })
        sprites.push(frame)
        const sprite = new Sprite(frame), point = stationPoint(worker.position)
        sprite.anchor.set(.5, .95); sprite.width = 430; sprite.height = 430; sprite.position.set(point.x, point.y); sprite.zIndex = point.y
        sprite.eventMode = 'static'; sprite.cursor = 'pointer'; sprite.on('pointertap', () => onWorker(worker.id))
        layer.addChild(sprite)
      }
      const board = new Sprite(textures[assetUrl('board')]); board.position.set(boardBox.left, boardBox.top); board.width = boardBox.width; board.height = boardBox.height; board.zIndex = 690; layer.addChild(board)
      const robotFrames = Array.from({ length: 4 }, (_, i) => new Texture({ source: robotSheet.source, frame: new Rectangle(i % 2 * robotSheet.width / 2, Math.floor(i / 2) * robotSheet.height / 2, robotSheet.width / 2, robotSheet.height / 2) }))
      sprites.push(...robotFrames)
      const shadow = new Graphics().ellipse(0, 0, 27, 10).fill({ color: 0x546172, alpha: .13 })
      const robot = new Sprite(robotFrames[0]); robot.anchor.set(.5, .92); robot.width = 146; robot.height = 146
      layer.addChild(shadow, robot)
      const initialPoint = project(engine.runtime.readActors()[0].position)
      robot.position.set(initialPoint.x, initialPoint.y - 3); robot.zIndex = initialPoint.y
      shadow.position.set(initialPoint.x, initialPoint.y); shadow.zIndex = initialPoint.y - .1
      onReady(engine)
      let elapsed = 0, uiElapsed = 0
      mounted.ticker.add(ticker => {
        if (!engine || disposed) return
        engine.tick(ticker.deltaMS)
        if (engine.running) elapsed += ticker.deltaMS / 1000
        const actor = engine.runtime.readActors()[0], step = actor.step, t = step ? Math.min(1, step.elapsedMs / step.durationMs) : 0
        const ground = step ? { x: step.from.x + (step.to.x - step.from.x) * t, y: step.from.y + (step.to.y - step.from.y) * t } : actor.position
        const point = project(ground)
        const frame = { front: 0, right: 1, left: 2, back: 3 }[actor.facing]
        robot.texture = robotFrames[frame]; robot.position.set(point.x, point.y - 3 - Math.sin(elapsed * 2.5) * 2); robot.zIndex = point.y
        shadow.position.set(point.x, point.y); shadow.zIndex = point.y - .1
        uiElapsed += ticker.deltaMS
        if (uiElapsed > 250) { uiElapsed = 0; if (engine.running) onChange() }
      })
      const resize = () => {
        if (disposed) return
        const { width, height } = host.getBoundingClientRect()
        if (width <= 0 || height <= 0) return
        mounted.renderer.resize(width, height)
        const scale = Math.min(width / roomSize.width, height / roomSize.height)
        world.scale.set(scale); world.position.set((width - roomSize.width * scale) / 2, (height - roomSize.height * scale) / 2)
        Object.assign(mounted.canvas.style, { width: '100%', height: '100%', display: 'block' })
        mounted.render()
      }
      observer = new ResizeObserver(resize); observer.observe(host); resize(); onChange()
      syncRunning()
    })().catch(error => { if (!disposed) { app?.stop(); onError(error instanceof Error ? error.message : String(error)) } })
    function syncRunning() { if (!app) return; if (document.hidden || !engine.running) app.stop(); else app.start() }
    document.addEventListener('visibilitychange', syncRunning)
    return { syncRunning, dispose() { disposed = true; document.removeEventListener('visibilitychange', syncRunning); observer?.disconnect(); app?.destroy(true, { children: true }); sprites.forEach(texture => texture.destroy(false)) } }
}
