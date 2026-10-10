import { Container, Graphics, Rectangle, Sprite, Text } from 'pixi.js'
import type { Texture } from 'pixi.js'
import type { PropViewRegistry } from '@pixoffice/renderer-pixi'
import { cropStatus } from '../core/crops.ts'

export const FARM_PLOT_LAYOUT = {
  scale: 1.5,
  soil: { x: 0, y: 2, width: 150, height: 96 },
  plantSize: 46,
  plantPivot: { x: .5, y: 240 / 256 },
  plantingPoints: [{ x: 27, y: 35 }, { x: 75, y: 35 }, { x: 123, y: 35 }, { x: 27, y: 77 }, { x: 75, y: 77 }, { x: 123, y: 77 }],
  sign: { x: 75, y: 54, width: 94, height: 75, titleY: -59, statusY: -46, progressY: -39 },
} as const

export function createFarmPlotView(textures: ReadonlyMap<string, Texture>, now: () => number): ReturnType<PropViewRegistry['create']> {
  const root = new Container(), soil = new Sprite(textures.get('soil')), backCrops = new Container(), frontCrops = new Container(), sign = new Container()
  const board = new Sprite(textures.get('plot-sign')), progress = new Graphics()
  const title = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 12, fill: 0x513c25, fontWeight: '600' } })
  const status = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 9, fill: 0x6b5030 } })
  const layout = FARM_PLOT_LAYOUT
  backCrops.label = 'farm-crops-back'; frontCrops.label = 'farm-crops-front'; sign.label = 'farm-plot-sign'
  root.scale.set(layout.scale)
  soil.position.set(layout.soil.x, layout.soil.y); soil.width = layout.soil.width; soil.height = layout.soil.height
  const plants = layout.plantingPoints.map(point => {
    const plant = new Sprite(textures.get('plant-carrot-1'))
    plant.anchor.set(layout.plantPivot.x, layout.plantPivot.y); plant.position.set(point.x, point.y)
    plant.width = layout.plantSize; plant.height = layout.plantSize
    const row = point.y < layout.sign.y ? backCrops : frontCrops
    row.addChild(plant); return plant
  })
  sign.position.set(layout.sign.x, layout.sign.y)
  board.anchor.set(.5, 1); board.width = layout.sign.width; board.height = layout.sign.height
  title.anchor.set(.5); title.position.set(0, layout.sign.titleY)
  status.anchor.set(.5); status.position.set(0, layout.sign.statusY)
  progress.position.set(-27, layout.sign.progressY)
  sign.addChild(board, title, status, progress)
  // The stake sits between rows: rear crops are behind it, front crops cover its foot.
  root.addChild(soil, backCrops, sign, frontCrops)
  const top = Math.min(layout.soil.y, layout.sign.y - layout.sign.height)
  root.hitArea = new Rectangle(0, top, layout.soil.width, layout.soil.y + layout.soil.height - top)
  let previous = ''
  return { roots: [root], hitTarget: root, update(prop) {
    root.position.set(prop.position.x * 50, prop.position.y * 50); root.zIndex = (prop.position.y + 1.8 * layout.scale) * 50
    const state = cropStatus(prop.state, now()), stage = state.stage === 'ready' ? 3 : state.stage === 'growing' ? 2 : 1
    const key = `${state.crop}-${stage}:${Math.floor(state.progress * 100)}:${prop.name}`
    if (key === previous) return
    previous = key; backCrops.visible = frontCrops.visible = Boolean(state.crop)
    // Soil never changes; every plant keeps one registered ground contact across stages.
    if (state.crop) for (const plant of plants) {
      plant.texture = textures.get(`plant-${state.crop}-${stage}`)!
      plant.width = layout.plantSize; plant.height = layout.plantSize
    }
    title.text = prop.name
    status.text = state.label
    progress.clear()
    if (state.crop && state.wateredAt !== null) {
      progress.roundRect(0, 0, 54, 2, 1).fill({ color: 0x795b35, alpha: .2 })
      if (state.progress) progress.roundRect(0, 0, Math.max(2, 54 * state.progress), 2, 1).fill(state.stage === 'ready' ? 0x8c6930 : 0x557a43)
    }
  } }
}
