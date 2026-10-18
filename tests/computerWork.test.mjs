import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'
import { characterPackFixture } from './helpers/characterPack.mjs'
import { Assets, Texture, TextureSource } from 'pixi.js'

let server, animation, schema, surfaceModule, furniture, DeskEntity
before(async () => {
  server = await createTestServer()
  animation = await server.ssrLoadModule('@pixoffice/assets-office/frame/workAnimation')
  schema = await server.ssrLoadModule('@pixoffice/assets-office/frame/packSchema')
  surfaceModule = await server.ssrLoadModule('@pixoffice/contracts/contactSurface')
  furniture = await server.ssrLoadModule('@pixoffice/scene-office/pixi/workstationSurface')
  ;({ DeskEntity } = await server.ssrLoadModule('@pixoffice/scene-office/pixi/views/DeskEntity'))
})
after(() => server?.close())
const ids = ['office-lead', 'code-agent', 'file-agent', 'app-agent', 'review-agent', 'data-agent']
const near = (a, b) => assert(Math.abs(a - b) < 1e-7, `${a} != ${b}`)
const pointNear = (a, b) => { near(a.x, b.x); near(a.y, b.y) }
const transform = (part, p) => {
  const x = (p.x - part.root.x) * part.mirror, y = p.y - part.root.y
  return { x: part.position.x + Math.cos(part.rotation) * x - Math.sin(part.rotation) * y,
    y: part.position.y + Math.sin(part.rotation) * x + Math.cos(part.rotation) * y }
}

for (const id of ids) test(`${id}: both workstations preserve joints, reach and fingertip contact throughout a complete loop`, async t => {
  const pack = await characterPackFixture(id); t.after(() => pack.dispose())
  const rig = pack.manifest.work
  for (const artwork of ['classic', 'trial']) {
    const surface = surfaceModule.transformWorkSurface(furniture.workstationSurface(artwork), 1 / .3, 128, 344 - 45 / .3)
    assert(animation.canUseWorkSurface(rig, surface), `${id}/${artwork} can reach the whole cycle`)
    const phases = new Set()
    for (let time = 0; time < animation.WORK_CYCLE_MS; time += 40) {
      const sampled = schema.sampleCharacterLayers(pack.manifest, 'work.computer-back', time, undefined, undefined, surface)
      assert(sampled.work); assert.equal(sampled.work.parts.length, 6)
      phases.add(sampled.work.phase)
      for (const [offset, side] of [[0, 'left'], [3, 'right']]) {
        const [upper, forearm, hand] = sampled.work.parts.slice(offset, offset + 3)
        pointNear(upper.position, rig.shoulders[side])
        pointNear(transform(upper, rig.upper.tip), forearm.position)
        pointNear(transform(forearm, rig.forearm.tip), hand.position)
        pointNear(transform(hand, rig.hand.tip), sampled.work.contacts[side])
        for (const [part, spec] of [[upper, rig.upper], [forearm, rig.forearm], [hand, rig.hand]]) {
          near(Math.hypot(transform(part, spec.tip).x - part.position.x, transform(part, spec.tip).y - part.position.y),
            Math.hypot(spec.tip.x - spec.root.x, spec.tip.y - spec.root.y))
        }
      }
      if (sampled.work.phase === 'review') pointNear(sampled.work.contacts.right, surface.mouse)
      assert(sampled.work.contacts.left.y <= surface.keyboardLeft.y)
      assert(surface.keyboardLeft.y - sampled.work.contacts.left.y <= 3)
    }
    assert.equal(phases.size, 5)
    for (const boundary of [5400, 6100, 8000, 10500, 11200, 12000]) {
      const before = animation.computerWorkTargets(surface, boundary - .001), after = animation.computerWorkTargets(surface, boundary)
      assert(Math.hypot(before.left.x - after.left.x, before.left.y - after.left.y) < .001)
      assert(Math.hypot(before.right.x - after.right.x, before.right.y - after.right.y) < .001)
    }
  }
})

test('furniture landmarks translate with the desk and use the mounted artwork, not the requested unavailable artwork', async t => {
  const { loadOfficeAssets } = await server.ssrLoadModule('@pixoffice/scene-office/pixi/assets/loadOfficeAssets')
  const { loadWorkstationTrialAssets } = await server.ssrLoadModule('@pixoffice/scene-office/pixi/assets/loadWorkstationTrialAssets')
  const make = (width, height) => new Texture({ source: new TextureSource({ width, height }) })
  const textures = { 'office-background': make(1402, 1122), 'office-desk': make(920, 582), 'office-chair': make(474, 492),
    'office-workstation-trial-v1-desk': make(1536, 1024), 'office-workstation-trial-v1-chair': make(1214, 1295), 'office-workstation-trial-v1-computer': make(1536, 1024) }
  t.mock.method(Assets, 'load', async alias => textures[alias])
  await loadOfficeAssets()
  const desk = new DeskEntity({ id: 'desk-test', x: 400, y: 200, seatX: 400, seatY: 245 })
  t.after(() => {
    for (const root of [desk.shadowGfx, desk.deskLayer, desk.chairLayer, desk.occupiedIndicator, desk.deskFrontLayer]) root.destroy({ children: true })
    Object.values(textures).forEach(texture => texture.destroy(true))
  })
  const classic = desk.getWorkSurface()
  pointNear(classic.mouse, { x: 400 + furniture.workstationSurface('classic').mouse.x, y: 200 + furniture.workstationSurface('classic').mouse.y })
  desk.setDesk({ id: 'desk-test', x: 600, y: 300, seatX: 600, seatY: 345 })
  const moved = desk.getWorkSurface()
  pointNear(moved.mouse, { x: classic.mouse.x + 200, y: classic.mouse.y + 100 })
  desk.setArtwork('trial')
  assert.deepEqual(desk.getWorkSurface(), moved, 'unloaded trial artwork still uses classic landmarks')
  await loadWorkstationTrialAssets()
  desk.remountSprites()
  assert.notDeepEqual(desk.getWorkSurface(), moved)
  pointNear(desk.getWorkSurface().mouse, { x: 600 + furniture.workstationSurface('trial').mouse.x, y: 300 + furniture.workstationSurface('trial').mouse.y })
  assert(surfaceModule.validWorkSurface(desk.getWorkSurface()))
  assert(surfaceModule.validWorkSurface(furniture.workstationSurface('fallback')))
})

test('work schema rejects dangling clips, zero-length parts and invalid contact surfaces', async t => {
  const pack = await characterPackFixture(); t.after(() => pack.dispose())
  for (const mutate of [m => { m.work.upper.clip = 'part.missing' }, m => { m.work.upper.tip = { ...m.work.upper.root } },
    m => { m.work.shoulders.left.x = -1 }, m => { m.work.previewSurface.mouse.y = 1000 },
    m => { m.clips[m.work.upper.clip] = { alias: 'idle.front', mirrorX: true } }]) {
    const manifest = structuredClone(pack.manifest); mutate(manifest)
    assert.equal(schema.CharacterManifestSchema.safeParse(manifest).success, false)
  }
  const clip = schema.characterPreviewTimeline(pack.manifest, 'work.computer-back')
  assert.equal(clip.frames.reduce((sum, frame) => sum + frame.durationMs, 0), animation.WORK_CYCLE_MS)
  assert(clip.loop)
})

test('missing work clips and unreachable work surfaces never substitute other poses', async t => {
  const pack = await characterPackFixture(); t.after(() => pack.dispose())
  const manifest = structuredClone(pack.manifest)
  delete manifest.clips['work.quiet-back']
  assert.equal(schema.sampleCharacterLayers(manifest, 'work.quiet-back'), undefined)
  assert.equal(schema.characterPreviewTimeline(manifest, 'work.quiet-back'), undefined)
  const surface = { ...manifest.work.previewSurface, keyboardLeft: { x: 10000, y: 10000 } }
  assert.equal(schema.sampleCharacterLayers(manifest, 'work.computer-back', 0, undefined, undefined, surface), undefined)
})
