import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { characterPackFixture } from './helpers/characterPack.mjs'
import sharp from 'sharp'
import { alphaBounds } from '../scripts/characters/build.mjs'

async function loadFrames(t) {
  const server = await createTestServer()
  t.after(() => server.close())
  return server.ssrLoadModule('/src/scene/characters/apartmentFrames.ts')
}

test('all six residents retain the former four-pose back gait for running', async t => {
  const { BACK_WALK_FRAMES, BACK_WALK_CYCLE_DURATION, resolveRefinedWalkFrame } = await loadFrames(t)
  assert.deepEqual(Object.keys(BACK_WALK_FRAMES).sort(), ['app-agent', 'code-agent', 'data-agent', 'file-agent', 'marvis', 'review-agent'])
  for (const [id, frames] of Object.entries(BACK_WALK_FRAMES)) {
    assert.equal(frames.length, 4)
    assert.equal(new Set(frames).size, 4)
    assert(frames.every(index => Number.isInteger(index) && index >= 0 && index < 8))
    assert.equal(frames[1], 2, `${id}: right raised key pose`)
    assert.equal(frames[3], 6, `${id}: left raised key pose`)
    const sequence = Array.from({ length: 5 }, (_, index) => frames[
      resolveRefinedWalkFrame('back', index * BACK_WALK_CYCLE_DURATION / 4, 4, BACK_WALK_CYCLE_DURATION).index
    ])
    assert.deepEqual(sequence, [...frames, frames[0]])
    const png = await readFile(new URL(`../public/assets/characters/apartment/back-walk-v1/${id}.png`, import.meta.url))
    assert.equal(png.subarray(1, 4).toString(), 'PNG')
    assert.equal(png.readUInt32BE(16), 1536)
    assert.equal(png.readUInt32BE(20), 1024)
    assert.equal(png[25], 6, 'RGBA PNG retains transparent background')
  }
})

test('indoor walking uses a separate four-phase atlas for each resident and a calmer cadence', async t => {
  const { INDOOR_BACK_WALK_ROWS, INDOOR_WALK_CYCLE_DURATION, BACK_WALK_CYCLE_DURATION, resolveRefinedWalkFrame } = await loadFrames(t)
  assert.deepEqual(Object.keys(INDOOR_BACK_WALK_ROWS), ['marvis', 'code-agent', 'file-agent', 'app-agent', 'review-agent', 'data-agent'])
  assert.deepEqual(Object.values(INDOOR_BACK_WALK_ROWS), [0, 1, 2, 3, 4, 5])
  assert(INDOOR_WALK_CYCLE_DURATION > BACK_WALK_CYCLE_DURATION)
  assert.deepEqual([0, .25, .5, .75, 1].map(phase =>
    resolveRefinedWalkFrame('back', phase * INDOOR_WALK_CYCLE_DURATION, 4, INDOOR_WALK_CYCLE_DURATION).index), [0, 1, 2, 3, 0])
  const png = await readFile(new URL('../public/assets/characters/apartment/indoor-back-walk-v1.png', import.meta.url))
  assert.equal(png.readUInt32BE(16), 1024)
  assert.equal(png.readUInt32BE(20), 1536)
  assert.equal(png[25], 6, 'indoor sprites retain an alpha channel')
})

test('uneven atlas columns never clip hair or leak a neighboring character into a frame', async t => {
  const { detectApartmentFrames, registerWalkFrames } = await loadFrames(t)
  const width = 160, height = 120, rgba = new Uint8Array(width * height * 4)
  const rectangles = []
  for (let row = 0; row < 2; row++) {
    for (const [left, right] of [[29, 45], [52, 72], [90, 111], [127, 150]]) {
      const top = row * 60 + 4, bottom = top + 48 - row * 6
      rectangles.push({ left, right, top, bottom })
      for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) rgba[(y * width + x) * 4 + 3] = 255
    }
  }
  const frames = detectApartmentFrames(rgba, width, height, 2, 4)
  frames.forEach((frame, index) => {
    const rect = rectangles[index]
    assert(frame.x <= rect.left && frame.x + frame.width > rect.right)
    assert(frame.y <= rect.top && frame.y + frame.height > rect.bottom)
    assert(frame.width <= rect.right - rect.left + 5)
  })
  const residents = [0, 1].map(row => registerWalkFrames(rgba, width, height, frames.slice(row * 4, row * 4 + 4)))
  assert(residents[0].frameSize.height > residents[1].frameSize.height, 'registration is per resident, not shared across different people')
  for (const resident of residents) {
    assert.equal(resident.frames.length, 4)
    resident.frames.forEach((frame, index) => {
      assert.equal(frame.height + resident.offsets[index].y, resident.frameSize.height)
    })
  }
})

test('back walking displays the indoor textures without an added running bounce', async t => {
  const server = await createTestServer()
  t.after(() => server.close())
  const { ApartmentCharacter } = await server.ssrLoadModule('/src/scene/characters/ApartmentCharacter.ts')
  const { sampleCharacterClip } = await server.ssrLoadModule('/src/scene/characters/packSchema.ts')
  const pack = await characterPackFixture()
  const character = new ApartmentCharacter('marvis')
  character.pack = pack
  character.setViewFacing('back')
  character.playState('walking')
  for (let step = 0; step < 8; step++) {
    character.update(step === 0 ? 0 : .25)
    const sample = sampleCharacterClip(pack.manifest, 'walk.back', step * 250)
    assert.equal(character.sprite.texture, pack.textures.get(sample.key))
    assert.equal(character.sprite.y, 0)
    assert.equal(character.sprite.scale.y, pack.manifest.displayHeight / pack.manifest.referenceHeight)
  }
  character.playState('idle')
  assert.equal(character.sprite.texture, pack.textures.get(sampleCharacterClip(pack.manifest, 'idle.back').key))
  character.destroy(); pack.dispose()
})

test('apartment directional frames use the correct row and only mirror left', async t => {
  const { resolveApartmentFrame } = await loadFrames(t)
  for (const [direction, index, mirrored] of [
    ['front', 0, false], ['right', 3, false], ['left', 3, true], ['back', 6, false],
  ]) {
    assert.deepEqual(resolveApartmentFrame(direction, 'idle'), { index, mirrored })
    assert.deepEqual([0, 0.125, 0.25, 0.375, 0.5].map(time =>
      resolveApartmentFrame(direction, 'walking', time).index),
    [index + 1, index, index + 2, index, index + 1])
  }
})

test('expressions face the viewer and walking takes priority over a previous expression', async t => {
  const { resolveApartmentFrame, apartmentPoseForState } = await loadFrames(t)
  for (const [expression, index] of [['wave', 9], ['thinking', 10], ['surprised', 11]]) {
    assert.deepEqual(resolveApartmentFrame('left', expression), { index, mirrored: false })
    assert.equal(apartmentPoseForState('talking', `emotes/${expression}`), expression)
    assert.equal(apartmentPoseForState('walking', `emotes/${expression}`), 'walking')
  }
  assert.equal(apartmentPoseForState('working'), 'idle')
  assert.equal(apartmentPoseForState('talking', 'unknown'), 'idle')
})

test('sheet trimming handles uneven rows without cutting off feet or including another pose', async t => {
  const { detectApartmentFrames } = await loadFrames(t)
  const width = 120, height = 160
  const rgba = new Uint8Array(width * height * 4)
  const rectangles = []
  for (const [top, bottom] of [[3, 41], [45, 78], [85, 122], [127, 155]]) {
    for (let col = 0; col < 3; col++) {
      const left = col * 40 + 10
      for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= left + 18; x++) rgba[(y * width + x) * 4 + 3] = 255
      }
      rectangles.push({ left, right: left + 18, top, bottom })
    }
  }
  const frames = detectApartmentFrames(rgba, width, height)
  assert.equal(frames.length, 12)
  for (const [index, frame] of frames.entries()) {
    const rect = rectangles[index]
    assert(frame.x <= rect.left && frame.x + frame.width > rect.right)
    assert(frame.y <= rect.top && frame.y + frame.height > rect.bottom)
    assert(frame.width < 40 && frame.height < 44)
  }
})

test('invalid, opaque and missing-pose sprite sheets fail explicitly', async t => {
  const { detectApartmentFrames } = await loadFrames(t)
  assert.throws(() => detectApartmentFrames(new Uint8Array(1), 120, 160), /dimensions/)
  assert.throws(() => detectApartmentFrames(new Uint8Array(120 * 160 * 4).fill(255), 120, 160), /gutter/)
  assert.throws(() => detectApartmentFrames(new Uint8Array(120 * 160 * 4), 120, 160), /empty/)
})

test('desk residents sit while resting and type while working', async t => {
  const { shouldSitAtDesk, apartmentPoseForState } = await loadFrames(t)
  const server = await createTestServer()
  t.after(() => server.close())
  const { INITIAL_AGENTS } = await server.ssrLoadModule('/src/scene/layout/officeLayout.ts')
  const agent = { ...INITIAL_AGENTS[0] }
  for (const state of ['idle', 'working', 'thinking']) {
    assert.equal(shouldSitAtDesk({ ...agent, state }), true)
    assert.equal(apartmentPoseForState(state, undefined, true), state === 'working' ? 'typing' : 'seated')
  }
  for (const patch of [
    { state: 'walking' }, { state: 'talking' }, { x: agent.x + 60 },
    { assignedDeskId: 'desk-1' }, { assignedDeskId: undefined },
    { targetX: agent.x }, { targetY: agent.y }, { customAnimation: 'emotes/wave' },
  ]) assert.equal(shouldSitAtDesk({ ...agent, ...patch }), false)
  assert.equal(apartmentPoseForState('walking', undefined, true), 'walking')
  assert.equal(apartmentPoseForState('talking', 'emotes/wave', true), 'wave')
  assert.equal(apartmentPoseForState('working', undefined, false), 'idle')
})

test('the seated atlas trims six distinct poses in reading order', async t => {
  const { detectApartmentFrames } = await loadFrames(t)
  const width = 120, height = 100
  const rgba = new Uint8Array(width * height * 4)
  for (const top of [3, 54]) {
    for (let col = 0; col < 3; col++) {
      for (let y = top; y < top + 40; y++) {
        for (let x = col * 40 + 8; x < col * 40 + 30; x++) rgba[(y * width + x) * 4 + 3] = 255
      }
    }
  }
  const frames = detectApartmentFrames(rgba, width, height, 2)
  assert.equal(frames.length, 6)
  assert(frames[0].x < frames[1].x && frames[1].x < frames[2].x)
  assert(frames[3].y > frames[0].y)
  assert.throws(() => detectApartmentFrames(rgba, width, height, 0), /dimensions/)
})

test('a seated character uses side-head frames for listening and speech, never a standing pose', async t => {
  const server = await createTestServer()
  t.after(() => server.close())
  const { ApartmentCharacter } = await server.ssrLoadModule('/src/scene/characters/ApartmentCharacter.ts')
  const { sampleCharacterClip } = await server.ssrLoadModule('/src/scene/characters/packSchema.ts')
  const pack = await characterPackFixture()
  const character = new ApartmentCharacter('marvis')
  character.pack = pack
  character.setAtDesk(true)
  for (const state of ['idle', 'working', 'thinking', 'talking']) {
    character.playState(state)
    for (const facing of ['back', 'right', 'left', 'back']) {
      character.setViewFacing(facing)
      character.update(.05)
      const name = facing === 'back' ? state === 'working' ? 'work.quiet-back' : 'sit.back' : `talk.seated-${facing}`
      const sample = sampleCharacterClip(pack.manifest, name, character.elapsed)
      assert.equal(character.pose, state === 'working' ? 'typing' : 'seated')
      assert.equal(character.sprite.texture, pack.textures.get(sample.key))
      assert.equal(character.sprite.scale.x < 0, facing === 'left')
      const scale = character.sprite.scale.y
      assert(sample.frame.rect.height * scale > 60 && sample.frame.rect.height * scale < 84, 'a seated body stays shorter without shrinking its head')
      assert(Math.abs((sample.frame.offset.y + sample.frame.rect.height - pack.manifest.pivot.y) * scale - 10) < 2)
      assert.equal(character.sprite.y, 0, 'the fixed ground anchor never changes when the head turns')
    }
  }
  character.destroy(); pack.dispose()
})

test('legacy packs still loop registered typing frames only while working at their desk', async t => {
  const server = await createTestServer()
  t.after(() => server.close())
  const { ApartmentCharacter } = await server.ssrLoadModule('/src/scene/characters/ApartmentCharacter.ts')
  const { sampleCharacterClip } = await server.ssrLoadModule('/src/scene/characters/packSchema.ts')
  for (const id of ['marvis', 'code-agent', 'file-agent', 'app-agent', 'review-agent', 'data-agent']) {
    const pack = await characterPackFixture(id)
    delete pack.manifest.work
    delete pack.manifest.clips['work.quiet-back']
    const character = new ApartmentCharacter(id)
    character.pack = pack
    character.setAtDesk(true)
    character.setViewFacing('back')
    character.playState('working')
    const clip = pack.manifest.clips['work.typing-back']
    assert.equal(clip.loop, true)
    assert.equal(clip.frames.length, 4)
    assert.equal(new Set(clip.frames.map(frame => frame.frame)).size, 4, `${id}: four independent hand poses`)
    const seen = []
    let elapsedMs = 0
    for (let step = 0; step <= 4; step++) {
      const advanceMs = step === 0 ? 0 : clip.frames[step - 1].durationMs
      elapsedMs += advanceMs
      character.update(advanceMs / 1000)
      const sample = sampleCharacterClip(pack.manifest, 'work.typing-back', elapsedMs)
      seen.push(character.sprite.texture)
      assert.equal(character.sprite.texture, pack.textures.get(sample.key))
      assert.equal(character.sprite.scale.y, .3, 'typing never changes the character scale')
      assert.equal(character.sprite.x, 0)
      assert.equal(character.sprite.y, 0, 'typing never moves the ground anchor')
    }
    assert.equal(new Set(seen.slice(0, 4)).size, 4)
    assert.equal(seen[4], seen[0], 'the cycle returns to its first hand pose')
    character.playState('idle')
    assert.equal(character.sprite.texture, pack.textures.get(sampleCharacterClip(pack.manifest, 'sit.back').key))
    character.playState('walking')
    assert.equal(character.sprite.texture, pack.textures.get(sampleCharacterClip(pack.manifest, 'walk.back').key))
    character.setAtDesk(false)
    character.playState('working')
    assert.equal(character.sprite.texture, pack.textures.get(sampleCharacterClip(pack.manifest, 'idle.back').key))
    character.destroy(); pack.dispose()
  }
})

test('packs without a typing action retain the ordinary seated fallback', async t => {
  const server = await createTestServer()
  t.after(() => server.close())
  const { ApartmentCharacter } = await server.ssrLoadModule('/src/scene/characters/ApartmentCharacter.ts')
  const { sampleCharacterClip } = await server.ssrLoadModule('/src/scene/characters/packSchema.ts')
  const pack = await characterPackFixture()
  delete pack.manifest.clips['work.typing-back']
  delete pack.manifest.clips['work.quiet-back']
  const character = new ApartmentCharacter('marvis')
  character.pack = pack
  character.setAtDesk(true)
  character.setViewFacing('back')
  character.playState('working')
  character.update(.2)
  assert.equal(character.sprite.texture, pack.textures.get(sampleCharacterClip(pack.manifest, 'sit.back').key))
  character.destroy(); pack.dispose()
})

test('seat transitions use whole-body keyframes in reverse order for sitting', async t => {
  const { resolveSeatTransitionFrame } = await loadFrames(t)
  const transition = { seat: { x: 100, y: 100 }, approach: { x: 144, y: 125 }, progress: 0 }
  const amounts = [1, .75, .35, 0]
  for (const stage of ['rising', 'sitting']) {
    const sequence = stage === 'rising' ? amounts : [...amounts].reverse()
    const poses = sequence.map(seatedAmount => resolveSeatTransitionFrame({ ...transition, stage, seatedAmount }, 'back').pose)
    assert.deepEqual(poses, stage === 'rising' ? ['seated', 'lean', 'rise', 'base'] : ['base', 'rise', 'lean', 'seated'])
  }
  for (const [facing, row, mirrored] of [['right', 3, false], ['left', 3, true], ['back', 6, false], ['front', 0, false]]) {
    const aligning = resolveSeatTransitionFrame({ ...transition, stage: 'aligning' }, facing)
    assert.equal(aligning.index, row)
    assert.equal(aligning.mirrored, mirrored)
    for (const progress of [0, .25, .5, .75, 1]) {
      const exit = resolveSeatTransitionFrame({ ...transition, stage: 'exiting', progress }, facing)
      const enter = resolveSeatTransitionFrame({ ...transition, stage: 'entering', progress }, facing)
      assert.deepEqual(enter, exit, 'both entry and exit walk forward along the actual movement direction')
      assert(enter.index >= row && enter.index < row + 3)
    }
  }
})

test('seat keyframes override walking, stay registered and freeze with runtime progress', async t => {
  const server = await createTestServer()
  t.after(() => server.close())
  const { ApartmentCharacter } = await server.ssrLoadModule('/src/scene/characters/ApartmentCharacter.ts')
  const { sampleCharacterClip } = await server.ssrLoadModule('/src/scene/characters/packSchema.ts')
  const pack = await characterPackFixture()
  const character = new ApartmentCharacter('marvis')
  character.pack = pack
  const transition = { propId: 'desk-0', seat: { x: 100, y: 100 }, approach: { x: 144, y: 125 }, passage: [], stage: 'rising', progress: 0, seatedAmount: 1 }
  character.setSeatTransition(transition)
  character.playState('walking')
  for (const [amount, clip] of [[1, 'sit.back'], [.75, 'pose.lean'], [.35, 'pose.rise'], [0, 'idle.back']]) {
    transition.seatedAmount = amount
    for (const dt of [.05, 5]) {
      character.update(dt)
      assert.equal(character.sprite.texture, pack.textures.get(sampleCharacterClip(pack.manifest, clip).key))
      assert.equal(character.sprite.scale.y, .3, 'all postures reuse the same reference scale')
      assert.equal(character.sprite.y, 0)
    }
  }
  transition.stage = 'exiting'; transition.progress = .65; transition.waiting = true
  character.setViewFacing('right'); character.update(.05)
  const still = [character.sprite.texture, character.sprite.x, character.sprite.y, character.sprite.scale.x, character.sprite.scale.y]
  character.update(5)
  assert.deepEqual([character.sprite.texture, character.sprite.x, character.sprite.y, character.sprite.scale.x, character.sprite.scale.y], still)
  character.setSeatTransition(undefined); character.setAtDesk(true); character.playState('idle'); character.setViewFacing('back'); character.update(.05)
  assert.equal(character.sprite.texture, pack.textures.get(sampleCharacterClip(pack.manifest, 'sit.back').key))
  character.destroy(); pack.dispose()
})

test('working and thinking cannot override a seated participant looking at their visitor', async t => {
  const server = await createTestServer()
  t.after(() => server.close())
  const { AgentEntity } = await server.ssrLoadModule('/src/scene/entities/AgentEntity.ts')
  const entity = Object.create(AgentEntity.prototype)
  const facings = []
  Object.assign(entity, {
    useSpine: true, animationX: 0, animationY: 0,
    spineChar: { setViewFacing: facing => facings.push(facing), playState() {} },
    bubble: { update() {} }, statusLabel: { setState() {}, setTask() {} }, updateOverlayPositions() {},
  })
  for (const state of ['working', 'thinking']) {
    entity.agent = { x: 0, y: 0, state, seated: true, viewFacing: 'left' }
    entity.updateVisuals(state, .05)
    assert.equal(entity.agent.viewFacing, 'left')
    assert.deepEqual(facings, [])
  }
  entity.agent = { x: 0, y: 0, state: 'working', viewFacing: 'left' }
  entity.updateVisuals('working', .05)
  assert.deepEqual(facings, ['back'], 'legacy working actors still face the desk')
})

test('walking preserves its facing at a subpixel waypoint instead of flashing to the front', async t => {
  const server = await createTestServer()
  t.after(() => server.close())
  const { AgentEntity } = await server.ssrLoadModule('/src/scene/entities/AgentEntity.ts')
  const entity = Object.create(AgentEntity.prototype)
  const facings = []
  Object.assign(entity, {
    useSpine: true, animationX: 0, animationY: 0,
    spineChar: { setViewFacing: facing => facings.push(facing), setFacing() {}, playState() {} },
    bubble: { update() {} }, statusLabel: { setState() {}, setTask() {} }, updateOverlayPositions() {},
  })
  for (const [facing, dx, dy] of [['right', 1, 0], ['left', -1, 0], ['back', 0, -1], ['front', 0, 1]]) {
    for (const distance of [2, .49, .01, 0]) {
      entity.agent = { x: 10, y: 20, state: 'walking', viewFacing: facing, targetX: 10 + dx * distance, targetY: 20 + dy * distance }
      entity.updateVisuals('walking', 1 / 60)
      assert.equal(entity.agent.viewFacing, facing, `${facing} at distance ${distance}`)
      assert.equal(facings.at(-1), facing)
    }
  }
  entity.agent = { x: 0, y: 0, state: 'walking', viewFacing: 'right', targetX: 0, targetY: -4 }
  entity.updateVisuals('walking', 1 / 60)
  assert.equal(entity.agent.viewFacing, 'back', 'a real corner still turns immediately')
})

test('seat alignment never overrides the projected docking direction', async t => {
  const server = await createTestServer()
  t.after(() => server.close())
  const { AgentEntity } = await server.ssrLoadModule('/src/scene/entities/AgentEntity.ts')
  const { createOfficeRuntime } = await server.ssrLoadModule('/src/runtime/createOfficeRuntime.ts')
  const { SeatInteractions } = await server.ssrLoadModule('/src/runtime/seatInteraction.ts')
  const { projectAgents } = await server.ssrLoadModule('/src/runtime/adapters/legacy.ts')
  const runtime = createOfficeRuntime()
  t.after(() => runtime.dispose())
  const seats = new SeatInteractions(runtime.navigation, { template: id => runtime.template(id) })
  const entity = Object.create(AgentEntity.prototype)
  let renderedFacing
  Object.assign(entity, {
    useSpine: true, animationX: 0, animationY: 0,
    spineChar: { setViewFacing(facing) { renderedFacing = facing }, setFacing() {}, playState() {} },
    bubble: { update() {} }, statusLabel: { setState() {}, setTask() {} }, updateOverlayPositions() {},
  })
  let walkingFrames = 0
  for (const resident of runtime.readActors()) {
    for (const port of seats.ports(runtime.readWorld(), resident.homeId)) {
      const world = runtime.readWorld(), actor = world.actors.find(a => a.id === resident.id)
      Object.assign(actor, { position: { ...port.approach }, posture: 'standing', using: undefined })
      for (const direction of ['enter', 'exit']) {
        seats.begin(actor, port, direction)
        for (let frame = 0; frame < 240 && actor.seatTransition; frame++) {
          seats.advance(world, actor, 16)
          const projected = projectAgents(runtime, false, world).find(a => a.id === actor.id)
          entity.agent = { ...projected }
          entity.updateVisuals(projected.state, .016)
          if (projected.state !== 'walking') continue
          walkingFrames++
          const label = `${actor.id} ${direction} via ${JSON.stringify(port.approach)} at frame ${frame}`
          assert.equal(renderedFacing, projected.viewFacing, label)
          assert.equal(entity.agent.viewFacing, projected.viewFacing, label)
          assert.equal(entity.agent.facing, projected.facing, label)
        }
        assert.equal(actor.seatTransition, undefined)
        assert.equal(actor.posture, direction === 'enter' ? 'seated' : 'standing')
      }
    }
  }
  assert(walkingFrames > 500, 'sample entry and exit at frame-level precision for all residents')
})

test('Marvis keeps the same head width through seated, leaning, rising and standing poses', async () => {
  const widths = []
  for (const name of ['idle/back', 'sit/back', 'pose/lean', 'pose/rise', 'talk/seated-right']) {
    const { data, info } = await sharp(new URL(`../art/characters/packs/marvis/${name}/001.png`, import.meta.url).pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const bounds = alphaBounds(data, info.width, info.height)
    let left = info.width, right = -1
    // These authored Marvis poses keep the widest part of the hair in the upper 45%.
    for (let y = bounds.top; y < bounds.top + Math.floor(bounds.height * .45); y++) {
      for (let x = bounds.left; x < bounds.left + bounds.width; x++) {
        if (data[(y * info.width + x) * 4 + 3] < 128) continue
        left = Math.min(left, x); right = Math.max(right, x)
      }
    }
    widths.push(right - left + 1)
    assert(Math.abs((left + right) / 2 - 128) <= 1, `${name}: head stays on the same horizontal pivot`)
  }
  assert(Math.max(...widths) - Math.min(...widths) <= 2, `head widths should agree within raster rounding: ${widths}`)
})

test('walk atlas uses shared scale and head registration despite arm silhouette changes', async t => {
  const { registerWalkFrames, detectApartmentFrames } = await loadFrames(t)
  const width = 160, height = 120
  const rgba = new Uint8Array(width * height * 4)
  const heads = []
  for (let index = 0; index < 8; index++) {
    const col = index % 4, row = Math.floor(index / 4)
    const center = col * 40 + 19 + index % 3
    const top = row * 60 + 4
    const bottom = top + 47 + index % 2
    heads.push(center)
    for (let y = top; y <= bottom; y++) {
      const left = y < top + 23 ? center - 5 : center - 6 - index % 4
      const right = y < top + 23 ? center + 5 : center + 8
      for (let x = left; x <= right; x++) rgba[(y * width + x) * 4 + 3] = 255
    }
  }
  const { frames, frameSize, offsets } = registerWalkFrames(rgba, width, height)
  assert.equal(frames.length, 8)
  const registeredHeads = frames.map((frame, index) => heads[index] - frame.x + offsets[index].x)
  assert.equal(new Set(registeredHeads).size, 1)
  frames.forEach((frame, index) => {
    assert(offsets[index].x >= 0 && offsets[index].y >= 0)
    assert(offsets[index].x + frame.width <= frameSize.width)
    assert.equal(offsets[index].y + frame.height, frameSize.height)
  })
  assert.throws(() => detectApartmentFrames(rgba, width, height, 2, 0), /dimensions/)
  assert.throws(() => registerWalkFrames(new Uint8Array(rgba.length).fill(255), width, height), /gutter/)
})
