import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { Assets, Texture, TextureSource } from 'pixi.js'
import { createTestServer } from './helpers/vite.mjs'

let server, views, surface, transformWorkSurface
before(async () => {
  server = await createTestServer()
  views = await server.ssrLoadModule('/packages/scene-office/src/pixi/views/referenceOffice.ts')
  surface = await server.ssrLoadModule('/packages/scene-office/src/pixi/workstationSurface.ts')
  ;({ transformWorkSurface } = await server.ssrLoadModule('/packages/contracts/src/contactSurface.ts'))
})
after(() => server?.close())

test('all decorative bases stay inside the actual tabletop and translate with the workstation', () => {
  const base = transformWorkSurface(surface.workstationSurface('trial'), 1.5, 400, 200)
  const parts = views.referenceAccessoryPlacements(base)
  for (const part of parts) {
    assert(part.x - part.width / 2 >= base.bounds.left)
    assert(part.x + part.width / 2 <= base.bounds.right)
    assert(part.y >= base.bounds.back && part.y <= base.bounds.front)
  }
  const moved = views.referenceAccessoryPlacements(transformWorkSurface(base, 1, 150, 200))
  parts.forEach((part, i) => {
    assert.equal(moved[i].x, part.x + 150)
    assert.equal(moved[i].y, part.y + 200)
  })
})

test('workstation accessories use separate cropped contact bases, not the transparent atlas bottom', async t => {
  const textures = new Map()
  t.mock.method(Assets, 'load', async alias => {
    const texture = new Texture({ source: new TextureSource({ width: alias.includes('desk-accessories') ? 2079 : 2000, height: alias.includes('desk-accessories') ? 756 : 1500 }) })
    textures.set(alias, texture); return texture
  })
  const { loadReferenceOfficeObjects } = await server.ssrLoadModule('/packages/scene-office/src/pixi/assets/loadReferenceOfficeAssets.ts')
  const { loadWorkstationTrialAssets } = await server.ssrLoadModule('/packages/scene-office/src/pixi/assets/loadWorkstationTrialAssets.ts')
  const { loadOfficeAssets } = await server.ssrLoadModule('/packages/scene-office/src/pixi/assets/loadOfficeAssets.ts')
  await loadOfficeAssets(); await loadReferenceOfficeObjects(() => {}); await loadWorkstationTrialAssets()
  const prop = { id: 'desk', position: { x: 5, y: 5 } }
  const view = views.referenceWorkstationView(prop)
  const enlarged = views.createReferenceWorkstationView(1.875)(prop)
  try {
    view.update(prop, {}, [])
    const indicator = view.roots[3]
    const clear = t.mock.method(indicator, 'clear', indicator.clear)
    const actors = [{ furniture: { propId: prop.id, seated: true, transitioning: false } }]
    for (let i = 0; i < 60; i++) view.update(prop, {}, actors)
    assert.equal(clear.mock.callCount(), 1, 'unchanged occupancy must reuse its indicator geometry')
    view.update(prop, {}, [])
    assert.equal(clear.mock.callCount(), 2)
    const group = view.roots.at(-1)
    assert.equal(group.children.length, 3)
    assert.deepEqual(group.children.map(sprite => [sprite.texture.frame.x, sprite.texture.frame.y]), [[45, 133], [1467, 374], [1728, 185]])
    const parts = views.referenceAccessoryPlacements(view.getWorkSurface())
    group.children.forEach((sprite, i) => {
      assert.equal(sprite.anchor.y, 1)
      assert.equal(group.x + sprite.x, parts[i].x)
      assert.equal(group.y + sprite.y, parts[i].y)
    })
    const desktop = view.roots[1], computer = desktop.children.at(-1)
    const anchor = views.referenceMonitorAnchor(prop.position)
    assert.equal(anchor.x, desktop.x + computer.x * desktop.scale.x)
    assert(Math.abs(anchor.y + 14 - (desktop.y + computer.y * desktop.scale.y)) < 1e-7)
    const right = views.referenceMonitorAnchor(prop.position, 'right')
    const sourceScale = computer.scale.x * desktop.scale.x
    assert(Math.abs(right.x - 6 - (desktop.x + (1233 - 800) * sourceScale)) < 1e-7)
    assert(Math.abs(right.y - (desktop.y + computer.y * desktop.scale.y + (362 - 112) * sourceScale)) < 1e-7)
    enlarged.update(prop, {}, [])
    const largeDesk = enlarged.roots[1], largeComputer = largeDesk.children.at(-1)
    const largeRight = views.referenceMonitorAnchor(prop.position, 'right', 1.875)
    const largeSourceScale = largeComputer.scale.x * largeDesk.scale.x
    assert.equal(largeDesk.scale.x / desktop.scale.x, 1.25)
    assert(Math.abs(largeRight.x - 6 - (largeDesk.x + (1233 - 800) * largeSourceScale)) < 1e-7)
    assert(Math.abs(largeRight.y - (largeDesk.y + largeComputer.y * largeDesk.scale.y + (362 - 112) * largeSourceScale)) < 1e-7)
    const largeParts = views.referenceAccessoryPlacements(enlarged.getWorkSurface(), 1.25)
    enlarged.roots.at(-1).children.forEach((sprite, i) => {
      assert.equal(sprite.width, group.children[i].width * 1.25)
      assert.equal(sprite.x + group.x, largeParts[i].x)
      assert.equal(sprite.y + group.y, largeParts[i].y)
      assert(largeParts[i].x - largeParts[i].width / 2 >= enlarged.getWorkSurface().bounds.left)
      assert(largeParts[i].x + largeParts[i].width / 2 <= enlarged.getWorkSurface().bounds.right)
    })
    const before = enlarged.roots.map(root => [root.x, root.y, root.scale.x])
    enlarged.update(prop, {}, [])
    assert.deepEqual(enlarged.roots.map(root => [root.x, root.y, root.scale.x]), before, 'repeated updates must not compound the scale')
  } finally {
    view.roots.forEach(root => root.destroy({ children: true }))
    enlarged.roots.forEach(root => root.destroy({ children: true }))
    textures.forEach(texture => texture.destroy(true))
  }
})
