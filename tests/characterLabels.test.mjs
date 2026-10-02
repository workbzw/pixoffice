import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'
import { characterPackFixture } from './helpers/characterPack.mjs'

test('all six work loops keep names and bubbles fixed while complete picture frames change', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { ApartmentCharacter } = await server.ssrLoadModule('/src/scene/characters/ApartmentCharacter.ts')
  const { AgentEntity } = await server.ssrLoadModule('/src/scene/entities/AgentEntity.ts')
  for (const id of ['marvis', 'code-agent', 'file-agent', 'app-agent', 'review-agent', 'data-agent']) {
    const pack = await characterPackFixture(id), character = new ApartmentCharacter(id)
    character.pack = pack
    t.after(() => { character.destroy(); pack.dispose() })
    character.setAtDesk(true); character.setViewFacing('back'); character.playState('working')
    const names = new Set(), bubbles = new Set(), textures = new Set()
    const entity = {
      character,
      statusLabel: { layout(y) { names.add(y) }, getLabelTopY(y) { return y - 30 } },
      bubble: { position: { set(_x, y) { bubbles.add(y) } } },
    }
    for (let elapsed = 0; elapsed <= 12000; elapsed += 50) {
      character.update(elapsed ? .05 : 0)
      AgentEntity.prototype.updateOverlayPositions.call(entity)
      textures.add(character.sprite.texture)
    }
    assert.equal(textures.size, 4, `${id}: animation must still play all four pictures`)
    assert.equal(names.size, 1, `${id}: name must not follow per-frame alpha trim`)
    assert.equal(bubbles.size, 1, `${id}: bubble must not follow per-frame alpha trim`)
  }
})

test('fixed loop labels use the current clip, but seat transitions retain their changing height', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { ApartmentCharacter } = await server.ssrLoadModule('/src/scene/characters/ApartmentCharacter.ts')
  const pack = await characterPackFixture('code-agent'), character = new ApartmentCharacter('code-agent')
  character.pack = pack
  t.after(() => { character.destroy(); pack.dispose() })
  const { manifest } = pack, scale = manifest.displayHeight / manifest.referenceHeight
  const top = file => (manifest.frames[file].offset.y - manifest.pivot.y) * scale - 4
  character.setAtDesk(true); character.setViewFacing('back'); character.playState('working')
  character.update(.25)
  assert.equal(character.getHeadOffsetY(), top(manifest.clips['work.quiet-back'].frames[0].frame))
  character.playState('idle'); character.update(0)
  assert.equal(character.getHeadOffsetY(), top(manifest.clips['sit.back'].frames[0].frame))
  for (const seatedAmount of [1, 0]) {
    character.setSeatTransition({ stage: 'rising', seatedAmount }); character.update(0)
    const frames = manifest.clips['stand-up.back'].frames
    assert.equal(character.getHeadOffsetY(), top((seatedAmount ? frames[0] : frames.at(-1)).frame))
  }
})
