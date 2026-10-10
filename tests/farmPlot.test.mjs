import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { Texture, TextureSource } from 'pixi.js'
import sharp from 'sharp'
import { createFarmPlotView, FARM_PLOT_LAYOUT } from '../packages/scene-farm/dist/pixi/plotView.js'
import { createFarmWorld, farmObjects } from '@pixoffice/scene-farm'
import { createFarmPresentation } from '@pixoffice/scene-farm/pixi'

test('soil and planting contacts stay fixed through every crop stage and harvest', t => {
  const textures = new Map(), texture = (width, height) => new Texture({ source: new TextureSource({ width, height }) })
  textures.set('soil', texture(480, 320))
  textures.set('plot-sign', texture(384, 304))
  for (const crop of ['carrot', 'tomato', 'cabbage']) for (const stage of [1, 2, 3]) textures.set(`plant-${crop}-${stage}`, texture(256 + stage, 256 + stage))
  t.after(() => { for (const item of textures.values()) item.destroy(true) })
  let now = 0
  const view = createFarmPlotView(textures, () => now), root = view.roots[0], [soil, backPlants, sign, frontPlants] = root.children
  t.after(() => root.destroy({ children: true }))
  const geometry = () => ({ soil: { texture: soil.texture, x: soil.x, y: soil.y, width: soil.width, height: soil.height },
    plants: [...backPlants.children, ...frontPlants.children].map(p => ({ x: p.x, y: p.y, width: p.width, height: p.height, anchor: { x: p.anchor.x, y: p.anchor.y } })),
    sign: { x: sign.x, y: sign.y, board: { width: sign.children[0].width, height: sign.children[0].height } } })
  const original = geometry(), prop = { id: 'plot-1', name: '菜地', position: { x: 5, y: 5 }, state: {} }
  assert.equal(root.scale.x, 1.5); assert.equal(root.scale.y, 1.5)
  assert.equal(view.hitTarget, root)
  assert(root.hitArea.contains(FARM_PLOT_LAYOUT.sign.x, FARM_PLOT_LAYOUT.sign.y + FARM_PLOT_LAYOUT.sign.titleY))
  assert(root.hitArea.contains(1, FARM_PLOT_LAYOUT.soil.height))
  for (const crop of ['carrot', 'tomato', 'cabbage']) for (const time of [null, 0, 22000, 50000]) {
    now = time ?? 0; prop.state = { crop, plantedAt: 0, wateredAt: time === null ? null : 0 }
    view.update(prop)
    assert(backPlants.visible && frontPlants.visible); assert(sign.visible)
    assert.deepEqual(geometry(), original, `${crop} at ${time} moved its ground contact`)
    assert.equal(sign.children[1].text, '菜地')
    assert.equal(root.x, 250); assert.equal(root.y, 250)
  }
  prop.state = { crop: null, plantedAt: null, wateredAt: null }; view.update(prop)
  assert.equal(backPlants.visible, false); assert.equal(frontPlants.visible, false); assert(sign.visible)
  assert.equal(sign.children[2].text, '待播种'); assert.deepEqual(geometry(), original)
  assert.deepEqual(original.plants.map(p => ({ x: p.x, y: p.y })), FARM_PLOT_LAYOUT.plantingPoints)
  assert.equal(backPlants.children.length, 3); assert.equal(frontPlants.children.length, 3)
  assert.equal(sign.x, FARM_PLOT_LAYOUT.soil.width / 2)
  assert(sign.y > backPlants.children[0].y && sign.y < frontPlants.children[0].y)
  assert(sign.children.slice(1).every(child => child.y < 0), 'all labels and progress belong on the plaque, not below the plot')
})

test('larger farm visuals fit their occupied cells and keep the complete background framing', () => {
  const presentation = createFarmPresentation('https://example.test/farm/', () => 0), world = createFarmWorld()
  assert.equal(presentation.viewBounds, undefined)
  const plot = farmObjects.templates.find(item => item.id === 'farm.plot'), layout = FARM_PLOT_LAYOUT
  assert(layout.soil.width * layout.scale <= plot.footprint.right * presentation.cellPixels)
  assert((layout.soil.y + layout.soil.height) * layout.scale <= plot.footprint.bottom * presentation.cellPixels)
  assert.equal(plot.anchors.work.y, plot.footprint.bottom)
  const people = presentation.projectActors({ readActivePhases: () => [], readActors: () => world.actors })
  assert(people.every(person => person.displayHeight === 112 * layout.scale))
  for (const prop of world.props) {
    const template = farmObjects.templates.find(item => item.id === prop.templateId)
    assert(prop.position.x >= world.bounds.left && prop.position.x + template.footprint.right <= world.bounds.right)
    assert(prop.position.y >= world.bounds.top && prop.position.y + template.footprint.bottom <= world.bounds.bottom)
  }
})

test('all crop images use one canvas, scale and registered ground baseline', async () => {
  const root = new URL('../public/farm-assets/', import.meta.url)
  const registration = JSON.parse(await readFile(new URL('crop-registration.json', root), 'utf8'))
  assert.deepEqual(registration.canvas, { width: 256, height: 256 }); assert.deepEqual(registration.pivot, { x: 128, y: 240 })
  assert.equal(registration.plants.length, 9)
  for (const plant of registration.plants) {
    const { data, info } = await sharp(await readFile(new URL(plant.file, root))).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    assert.equal(info.width, 256); assert.equal(info.height, 256); assert.equal(plant.top + plant.height, 240)
    assert(Math.abs(plant.left + plant.groundX * plant.width / plant.source.width - 128) <= .5)
    let bottom = -1
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 32) bottom = Math.max(bottom, y)
    assert(bottom >= 238 && bottom <= 239, `${plant.file}: ground baseline ${bottom}`)
  }
})
