import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSceneRuntime } from '@pixoffice/runtime'
import { classroomScenePack, classroomRoster } from '@pixoffice/scene-classroom'
import { createClassroomPresentation } from '@pixoffice/scene-classroom/pixi'
import { bindClassroomFrames, classroomAppearanceIds } from '@pixoffice/assets-classroom'
import { visualAssetManifestSchema } from '@pixoffice/contracts'
import { CharacterManifestSchema, characterFrameDependencies } from '@pixoffice/animation-frame/packSchema'
import { readFile } from 'node:fs/promises'
import { Assets, Texture, TextureSource } from 'pixi.js'
import sharp from 'sharp'
import { CLASSROOM_ARTWORK, CLASSROOM_CHARACTER, CLASSROOM_CONTENT_SCALE, CLASSROOM_SEATED_OFFSET, CLASSROOM_SEAT_RECESS, classroomActorGeometry, classroomCellCenter, classroomFurnitureLayout } from '../packages/scene-classroom/dist/pixi/alignment.js'
import { createClassroomDeskView } from '../packages/scene-classroom/dist/pixi/deskView.js'
import { AnimationPresenter } from '../packages/renderer-pixi/dist/presentation/AnimationPresenter.js'

const base = (runtime, id) => ({ protocolVersion: '2.0', sceneId: runtime.sceneId, commandId: id })
const participants = classroomRoster.map(p => ({ entityId: p.id, role: p.role }))
function runtimeFor(t, pack = classroomScenePack) { const runtime = createSceneRuntime(pack); t.after(() => runtime.dispose()); return runtime }
function answer(runtime, student = 'student-1', id = `answer-${student}`) {
  return { ...base(runtime, id), type: 'activity.start', capability: 'classroom.answer',
    participants: [{ entityId: 'teacher', role: 'teacher' }, { entityId: student, role: 'student' }],
    params: { question: '我们生活在哪里？', answer: '地球上。', durationMs: 1000 } }
}
function finish(runtime, ids, observe = () => {}) {
  for (let i = 0; i < 10000 && ids.some(id => ['running', 'queued'].includes(runtime.getRecord(id)?.status)); i++) { runtime.tick(50); observe() }
  for (const id of ids) assert.equal(runtime.getRecord(id).status, 'completed', JSON.stringify(runtime.getRecord(id)))
}
function assertGround(runtime) {
  const world = runtime.readWorld()
  for (const actor of world.actors) {
    assert(Number.isInteger(actor.position.x) && Number.isInteger(actor.position.y))
    if (actor.step) assert(actor.step.from.x === actor.step.to.x || actor.step.from.y === actor.step.to.y, 'Movement must remain orthogonal')
    assert(actor.position.x >= 3 && actor.position.x < 21 && actor.position.y >= 6 && actor.position.y < 18, 'Actor escaped classroom floor')
    for (const prop of world.props) {
      const template = runtime.template(prop.templateId), x = actor.position.x - prop.position.x, y = actor.position.y - prop.position.y
      const box = template.footprint
      if (x >= box.left && x < box.right && y >= box.top && y < box.bottom) {
        assert.equal(prop.id, actor.homeId, 'Actor passed through someone else\'s desk')
        assert(template.interactions?.seat.cells.some(cell => cell.x === x && cell.y === y), 'Actor passed through tabletop')
      }
    }
  }
}

test('classroom is headless, independently namespaced and starts with one teacher and five seated students', t => {
  const runtime = runtimeFor(t), world = runtime.readWorld()
  assert.equal(world.actors.length, 6)
  assert(world.actors.filter(a => a.id !== 'teacher').every(a => a.posture === 'seated' && a.facing === 'back'))
  assert(!runtime.snapshot().plugins.some(p => p.id.startsWith('office.')))
  assertGround(runtime)
})

for (const student of classroomRoster.filter(p => p.role === 'student')) test(`${student.id} answers, returns to the owned chair without crossing furniture or diagonal steps`, t => {
  const runtime = runtimeFor(t), command = answer(runtime, student.id)
  const start = runtime.readActors().find(a => a.id === student.id).position
  assert.equal(runtime.submit(command).status, 'running')
  let reachedBoard = false, spoke = false
  finish(runtime, [command.commandId], () => {
    assertGround(runtime)
    const actor = runtime.readActors().find(a => a.id === student.id)
    if (actor.position.x === 13 && actor.position.y === 8 && actor.posture === 'standing') reachedBoard = true
    if (actor.speech?.text === '地球上。') { spoke = true; assert.equal(actor.facing, 'front'); assert(!actor.step) }
  })
  const actor = runtime.readActors().find(a => a.id === student.id)
  assert(reachedBoard && spoke); assert.deepEqual(actor.position, start); assert.equal(actor.posture, 'seated'); assert.equal(actor.facing, 'back')
  assert(!runtime.snapshot().resources.some(r => r.holders.length))
})

for (const fps of [30, 60, 120]) for (const student of classroomRoster.filter(p => p.role === 'student')) test(`${student.id} keeps the walking cycle across cells and seat passages at ${fps} fps`, async t => {
  const runtime = runtimeFor(t), pack = createClassroomPresentation('https://example.test/classroom/')
  const presenter = new AnimationPresenter(), command = answer(runtime, student.id)
  const actor = runtime.readActors().find(a => a.id === student.id)
  const manifest = visualAssetManifestSchema.parse(JSON.parse(await readFile(new URL(`../public/classroom-assets/${actor.templateId}/visual.json`, import.meta.url), 'utf8')))
  runtime.submit(command)
  let previous, movementBoundaries = 0, passageBoundaries = 0, turns = 0
  for (let i = 0; i < fps * 180 && runtime.getRecord(command.commandId).status === 'running'; i++) {
    runtime.tick(1000 / fps)
    const raw = runtime.readActors().find(a => a.id === student.id)
    const projected = pack.projectActors(runtime).find(a => a.id === student.id)
    const sample = presenter.sample(projected, manifest, 1 / fps), body = sample.actions[0]
    if (!raw.step && !raw.seatTransition && raw.motion && !raw.motion.waiting && raw.motion.index < raw.motion.path.length) {
      movementBoundaries++; assert.equal(projected.intent.actionId, 'core.walk', 'A cell boundary must not flash an idle pose')
    }
    if (!raw.step && ['entering', 'exiting'].includes(raw.seatTransition?.stage) && !raw.seatTransition.waiting) {
      passageBoundaries++; assert.equal(projected.intent.actionId, 'core.walk', 'A seat passage boundary must not flash an idle pose')
    }
    if (projected.intent.actionId === 'core.walk') {
      assert.equal(projected.status, 'walking'); assert.equal(projected.intent.speech, undefined)
      assert.equal(body.clock.mode, 'distance')
      if (previous?.action === 'core.walk') {
        assert.equal(body.instanceId, previous.body.instanceId, 'The gait instance must survive cell boundaries and turns')
        assert(body.clock.travelledDu >= previous.body.clock.travelledDu, 'Travelled distance must not reset while walking')
        if (projected.intent.view !== previous.view) turns++
      }
    }
    previous = { action: projected.intent.actionId, view: projected.intent.view, body }
  }
  assert.equal(runtime.getRecord(command.commandId).status, 'completed')
  assert(movementBoundaries > 0 && passageBoundaries > 0 && turns > 0, 'Exercise cells, seat passages and turns')
  const settled = pack.projectActors(runtime).find(a => a.id === student.id)
  assert.equal(settled.intent.actionId, 'core.idle'); assert.equal(settled.intent.poseId, 'seated')
})

test('classroom distinguishes continuous movement from blocked, aligning and posture-changing states', t => {
  const runtime = runtimeFor(t), pack = createClassroomPresentation('https://example.test/classroom/')
  const world = runtime.readWorld(), actor = world.actors.find(a => a.id === 'student-1')
  const next = { x: actor.position.x + 1, y: actor.position.y }
  const step = { from: actor.position, to: next, elapsedMs: 100, durationMs: 480 }
  const motion = { path: [next], index: 0 }
  const transition = { propId: actor.homeId, seat: actor.position, approach: next, passage: [actor.position, next], progress: .5, seatedAmount: 0 }
  const cases = [
    ['moving', { motion }, 'core.walk'],
    ['blocked', { motion: { ...motion, waiting: true } }, 'core.idle'],
    ['finished path', { motion: { ...motion, index: 1 } }, 'core.idle'],
    ['cancelled motion still finishing a step', { step }, 'core.walk'],
    ['committed step with a waiting flag', { step, motion: { ...motion, waiting: true } }, 'core.walk'],
    ...['entering', 'exiting'].flatMap(stage => [
      [`${stage} between cells`, { seatTransition: { ...transition, stage } }, 'core.walk'],
      [`${stage} blocked`, { seatTransition: { ...transition, stage, waiting: true } }, 'core.idle'],
      [`${stage} committed step`, { step, seatTransition: { ...transition, stage, waiting: true } }, 'core.walk'],
    ]),
    ['aligning with pending movement', { motion, seatTransition: { ...transition, stage: 'aligning' } }, 'core.idle'],
    ['rising with pending movement', { motion, seatTransition: { ...transition, stage: 'rising' } }, 'core.stand-up'],
    ['sitting', { seatTransition: { ...transition, stage: 'sitting' } }, 'core.sit-down'],
    ['stopped', {}, 'core.idle'],
  ]
  for (const [label, state, action] of cases) {
    const projected = pack.projectActors(runtime, { ...world, actors: [{ ...actor, posture: 'standing', step: undefined, motion: undefined, seatTransition: undefined, speech: { text: '回答', remainingMs: 1000 }, ...state }] })[0]
    assert.equal(projected.intent.actionId, action, label)
    assert.equal(projected.status, action === 'core.walk' ? 'walking' : 'idle', label)
    if (action === 'core.walk' || state.seatTransition) assert.equal(projected.intent.speech, undefined, label)
    if (['core.stand-up', 'core.sit-down'].includes(action)) {
      assert.equal(projected.intent.poseId, 'transition', label); assert.equal(projected.intent.progress, .5, label)
    }
  }
})

test('lecture and multiple answers execute in sequence and reserve the teaching area', t => {
  const runtime = runtimeFor(t)
  const lecture = { ...base(runtime, 'lecture'), type: 'activity.start', capability: 'classroom.lecture', participants, params: { text: '认识地球', durationMs: 1000 } }
  const results = runtime.submitBatch({ mode: 'sequence', commands: [lecture, answer(runtime, 'student-2'), answer(runtime, 'student-5')] })
  assert(results.every(r => ['running', 'queued'].includes(r.status)))
  finish(runtime, results.map(r => r.commandId), () => { assertGround(runtime); assert(runtime.readActivePhases().length <= 1) })
})

for (const stage of ['rising', 'exiting', 'walking', 'speaking', 'entering', 'sitting']) test(`cancelling during ${stage} permits a clean return to class`, t => {
  const runtime = runtimeFor(t), command = answer(runtime)
  runtime.submit(command)
  let reached = false
  for (let i = 0; i < 2000; i++) {
    runtime.tick(50)
    const actor = runtime.readActors().find(a => a.id === 'student-1')
    if (actor.seatTransition?.stage === stage || stage === 'walking' && actor.step && !actor.seatTransition || stage === 'speaking' && actor.speech) { reached = true; break }
  }
  assert(reached, `Stage ${stage} was not reached`)
  runtime.submit({ ...base(runtime, 'cancel'), type: 'command.cancel', targetCommandId: command.commandId })
  assert.equal(runtime.getRecord(command.commandId).status, 'cancelled')
  assert(['running', 'queued'].includes(runtime.submit({ ...base(runtime, 'settle'), type: 'activity.start', capability: 'classroom.settle', participants, params: {} }).status))
  finish(runtime, ['settle'], () => assertGround(runtime))
  assert(runtime.readActors().filter(a => a.homeId).every(a => a.posture === 'seated' && a.facing === 'back'))
})

test('classroom rejects wrong roles, duplicate participants, wrong objects and stale board state', t => {
  const runtime = runtimeFor(t)
  const wrong = answer(runtime); wrong.participants[0].entityId = 'student-2'
  assert.equal(runtime.submit(wrong).error.code, 'INVALID_PARTICIPANTS')
  const duplicate = answer(runtime, 'student-1', 'duplicate'); duplicate.participants.push(duplicate.participants[1])
  assert.equal(runtime.submit(duplicate).error.code, 'INVALID_PARTICIPANTS')
  const badBoard = answer(runtime, 'student-1', 'wrong-board'); badBoard.params.boardId = 'desk-1'
  assert.equal(runtime.submit(badBoard).error.code, 'ENTITY_NOT_FOUND')
  const update = { ...base(runtime, 'board'), type: 'object.state.set', entityId: 'blackboard', expectedStateRevision: 0, state: { title: '新课程', text: '新问题' } }
  assert.equal(runtime.submit(update).status, 'completed')
  assert.equal(runtime.readWorld().props[0].state.text, '新问题')
  assert.equal(runtime.submit({ ...update, commandId: 'stale' }).error.code, 'REVISION_CONFLICT')
})

test('teaching roles do not depend on frame or skeletal appearance IDs', t => {
  const runtime = runtimeFor(t, { ...classroomScenePack, createWorld(id) {
    const world = classroomScenePack.createWorld(id)
    world.actors.forEach(a => { a.templateId = `skeleton-${a.id}` })
    return world
  } })
  const command = answer(runtime)
  assert.equal(runtime.submit(command).status, 'running'); finish(runtime, [command.commandId])
})

test('classroom manifests exclude office work clips and cover every projected teaching pose', async t => {
  const appearances = new Map()
  for (const id of classroomAppearanceIds) {
    const root = new URL(`../public/classroom-assets/${id}/`, import.meta.url)
    const appearance = visualAssetManifestSchema.parse(JSON.parse(await readFile(new URL('visual.json', root), 'utf8')))
    const manifest = CharacterManifestSchema.parse(JSON.parse(await readFile(new URL(appearance.source.uri, root), 'utf8')))
    assert.equal(manifest.profile, 'classroom')
    assert(Object.keys(manifest.clips).every(clip => !clip.startsWith('work.')))
    assert.deepEqual(bindClassroomFrames(manifest, appearance.source.uri), appearance)
    const missing = structuredClone(manifest); delete missing.clips['walk.front']
    assert.throws(() => bindClassroomFrames(missing, appearance.source.uri), /missing walk.front/)
    appearances.set(id, appearance)
  }
  const runtime = runtimeFor(t), pack = createClassroomPresentation('https://example.test/classroom/')
  const command = answer(runtime, 'student-4')
  runtime.submit(command)
  finish(runtime, [command.commandId], () => {
    for (const actor of pack.projectActors(runtime)) {
      assert(appearances.get(actor.appearanceId).capabilities.variants.some(v => v.actionId === actor.intent.actionId && v.poseId === actor.intent.poseId && v.view === actor.intent.view), JSON.stringify(actor.intent))
      if (actor.intent.actionId === 'core.walk') assert.equal(actor.intent.speech, undefined)
    }
  })
})

test('classroom startup atlases contain only current poses; walking and unused portraits remain deferred', async t => {
  const runtime = runtimeFor(t), pack = createClassroomPresentation('https://example.test/classroom/')
  for (const actor of pack.projectActors(runtime)) {
    const root = new URL(`../public/classroom-assets/${actor.appearanceId}/`, import.meta.url)
    const appearance = JSON.parse(await readFile(new URL('visual.json', root), 'utf8'))
    const manifest = CharacterManifestSchema.parse(JSON.parse(await readFile(new URL(appearance.source.uri, root), 'utf8')))
    const variant = appearance.capabilities.variants.find(v => v.channel === 'base' && v.actionId === actor.intent.actionId && v.poseId === actor.intent.poseId && v.view === actor.intent.view)
    assert(variant, `Initial pose must be supported: ${actor.id}`)
    const dependencies = characterFrameDependencies(manifest, [appearance.source.bindings[variant.variantId].clip])
    const startup = Object.entries(manifest.frames).filter(([, frame]) => manifest.pages[frame.page].group === 'startup').map(([key]) => key)
    assert.deepEqual(startup.sort(), dependencies.sort(), `${actor.id}: first paint must not require unrelated poses`)
    const walking = characterFrameDependencies(manifest, ['walk.front', 'walk.back'])
    assert(walking.some(key => manifest.pages[manifest.frames[key].page].group === 'deferred'))
    await readFile(new URL('portrait.webp', root))
  }
})

test('classroom desk and chair downloads start together and report only when each completes', async t => {
  const pack = createClassroomPresentation('https://example.test/classroom/'), calls = [], reports = [], gates = new Map()
  const textures = new Map(Object.values(CLASSROOM_ARTWORK).map(art => [art.file, new Texture({ source: new TextureSource({ width: 512, height: 512 }) })]))
  t.after(() => { for (const resolve of gates.values()) resolve(); for (const texture of textures.values()) texture.destroy(true) })
  t.mock.method(Assets, 'load', url => {
    const file = new URL(url).pathname.split('/').at(-1); calls.push(file)
    return new Promise(resolve => gates.set(file, () => resolve(textures.get(file))))
  })
  const loading = pack.loadObjects(id => reports.push(id))
  assert.deepEqual(calls, [CLASSROOM_ARTWORK.desk.file, CLASSROOM_ARTWORK.chair.file])
  assert.deepEqual(reports, [])
  gates.get(CLASSROOM_ARTWORK.chair.file)(); await Promise.resolve()
  assert.deepEqual(reports, ['classroom.chair'])
  gates.get(CLASSROOM_ARTWORK.desk.file)(); await loading
  assert.deepEqual(reports, ['classroom.chair', 'classroom.desk'])
})

test('every student keeps one scale and distinct seated and standing contact points', t => {
  const runtime = runtimeFor(t), pack = createClassroomPresentation('https://example.test/classroom/')
  for (const actor of runtime.readActors().filter(a => a.homeId)) {
    const ground = classroomCellCenter(actor.position), geometry = classroomActorGeometry(actor)
    const projected = pack.projectActors(runtime).find(a => a.id === actor.id)
    const footOffset = (CLASSROOM_CHARACTER.seatedFootY - CLASSROOM_CHARACTER.pivotY) * projected.displayHeight / CLASSROOM_CHARACTER.referenceHeight
    assert(Math.abs(geometry.position.y + footOffset - ground.y - CLASSROOM_SEAT_RECESS) < 1e-8)
    assert.equal(geometry.position.x, ground.x)
    assert.equal(geometry.depth, ground.y, 'depth must use the floor, not the raised seated sprite')
    const standing = classroomActorGeometry({ ...actor, posture: 'standing', using: undefined })
    assert.deepEqual(standing.position, ground)
    assert.equal(projected.displayHeight, CLASSROOM_CHARACTER.height)
  }
})

test('furniture keeps registered contacts and the tabletop meets the seated hand level', () => {
  const ground = { x: 325, y: 575 }, layout = classroomFurnitureLayout(ground)
  const scale = CLASSROOM_CHARACTER.height / CLASSROOM_CHARACTER.referenceHeight
  assert.equal(layout.seat.y, ground.y + CLASSROOM_SEATED_OFFSET + (CLASSROOM_CHARACTER.seatedSeatY - CLASSROOM_CHARACTER.pivotY) * scale)
  for (const key of ['desk', 'chair']) {
    const art = CLASSROOM_ARTWORK[key], transform = layout[key], contact = key === 'desk' ? layout.surface : layout.seat
    assert(Math.abs(transform.x + art.contact.x * transform.scale - contact.x) < 1e-8)
    assert(Math.abs(transform.y + art.contact.y * transform.scale - contact.y) < 1e-8)
    assert(Math.abs(art.visibleWidth * transform.scale - art.displayWidth) < 1e-8)
  }
  const deskFeet = layout.desk.y + CLASSROOM_ARTWORK.desk.frontFootY * layout.desk.scale
  const chairFeet = layout.chair.y + CLASSROOM_ARTWORK.chair.frontFootY * layout.chair.scale
  assert(deskFeet < ground.y - 8 * CLASSROOM_CONTENT_SCALE && deskFeet >= ground.y - 75, 'desk feet stay within its footprint and ahead of the standing feet')
  assert(chairFeet > ground.y && chairFeet < ground.y + 75, 'enlarged chair feet stay in the reserved furniture footprint')
  const desk = CLASSROOM_ARTWORK.desk
  const handY = ground.y + CLASSROOM_SEATED_OFFSET + (CLASSROOM_CHARACTER.seatedHandY - CLASSROOM_CHARACTER.pivotY) * scale
  const nearEdge = layout.desk.y + desk.nearEdgeY * layout.desk.scale
  assert(Math.abs(nearEdge - handY) < 8 * CLASSROOM_CONTENT_SCALE, 'the near tabletop edge belongs at hand level, not at head height')
  assert(layout.surface.y < layout.seat.y)
})

test('each standing point has clearance from both the desk and the chair', t => {
  const runtime = runtimeFor(t)
  for (const actor of runtime.readActors().filter(a => a.homeId)) {
    const floor = classroomCellCenter(actor.position), layout = classroomFurnitureLayout(floor)
    const desk = CLASSROOM_ARTWORK.desk, chair = CLASSROOM_ARTWORK.chair
    const deskFront = layout.desk.y + desk.frontFootY * layout.desk.scale
    const chairFront = layout.chair.y + chair.rearFootY * layout.chair.scale
    const standingFootRadius = 8 * CLASSROOM_CONTENT_SCALE
    assert(layout.standing.y - standingFootRadius > deskFront, 'standing feet cannot intersect the desk')
    assert(layout.standing.y + standingFootRadius < chairFront, 'standing feet must be ahead of the chair, not inside it')
    assert(chairFront - deskFront > standingFootRadius * 2, 'leave a usable standing lane')
  }
})

test('furniture source dimensions and published aspect ratios match their contact calibration', async () => {
  for (const art of Object.values(CLASSROOM_ARTWORK)) {
    const source = await sharp(new URL(`../art/classroom/${art.file.replace('.webp', '.png')}`, import.meta.url).pathname).metadata()
    assert.equal(source.width, art.width); assert.equal(source.height, art.height)
    const published = await sharp(new URL(`../public/classroom-assets/${art.file}`, import.meta.url).pathname).metadata()
    assert(Math.abs(published.width / published.height - art.width / art.height) < .005, 'asset build must preserve the furniture aspect ratio')
  }
})

test('the solid chair is a single foreground sprite without openwork masks or duplicate layers', t => {
  const runtime = runtimeFor(t), world = runtime.readWorld(), prop = world.props.find(p => p.id === 'desk-1')
  const textures = ['desk', 'chair'].map(key => new Texture({ source: new TextureSource({ width: CLASSROOM_ARTWORK[key].width, height: CLASSROOM_ARTWORK[key].height }) }))
  const view = createClassroomDeskView(...textures)
  t.after(() => { view.roots.forEach(root => root.destroy({ children: true })); textures.forEach(texture => texture.destroy(true)) })
  view.update(prop, runtime.template(prop.templateId), [])
  assert.equal(view.roots.length, 2)
  const [desk, chair] = view.roots, floorY = classroomCellCenter(world.actors.find(a => a.homeId === prop.id).position).y
  assert(desk.zIndex < floorY && chair.zIndex > floorY)
  for (const root of view.roots) assert.equal(root.scale.x, root.scale.y, 'never stretch furniture independently on X/Y')
  assert.equal(chair.children.length, 1)
  assert.equal(chair.children[0].mask, undefined)
})

test('chair shell is opaque continuously from the backrest into the seat', async () => {
  const { data, info } = await sharp(new URL(`../art/classroom/${CLASSROOM_ARTWORK.chair.file.replace('.webp', '.png')}`, import.meta.url).pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let y = 150; y <= 600; y += 10) for (let x = 450; x <= 800; x += 10) {
    assert(data[(y * info.width + x) * info.channels + 3] >= 250, 'solid chair must not have a transparent lumbar opening')
  }
})

test('the solid chair covers the actual seated hip pixels of all five students', async t => {
  const runtime = runtimeFor(t)
  const chair = await sharp(new URL(`../art/classroom/${CLASSROOM_ARTWORK.chair.file.replace('.webp', '.png')}`, import.meta.url).pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (const actor of runtime.readActors().filter(a => a.homeId)) {
    const root = new URL(`../public/classroom-assets/${actor.templateId}/`, import.meta.url)
    const visual = JSON.parse(await readFile(new URL('visual.json', root), 'utf8'))
    const manifest = JSON.parse(await readFile(new URL(visual.source.uri, root), 'utf8'))
    const frame = manifest.frames[manifest.clips['sit.back'].frames[0].frame]
    const pixels = await sharp(new URL(manifest.pages[frame.page].image, root).pathname).extract({ left: frame.rect.x, top: frame.rect.y, width: frame.rect.width, height: frame.rect.height }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const layout = classroomFurnitureLayout(classroomCellCenter(actor.position)), geometry = classroomActorGeometry(actor)
    const scale = CLASSROOM_CHARACTER.height / manifest.referenceHeight
    let checked = 0
    for (let y = 325; y <= 342; y++) for (let x = 0; x < frame.rect.width; x++) {
      const localY = y - frame.offset.y
      if (localY < 0 || localY >= frame.rect.height || pixels.data[(localY * frame.rect.width + x) * 4 + 3] < 240) continue
      const worldX = geometry.position.x + (x + frame.offset.x - manifest.pivot.x) * scale
      const worldY = geometry.position.y + (y - manifest.pivot.y) * scale
      const chairX = Math.round((worldX - layout.chair.x) / layout.chair.scale), chairY = Math.round((worldY - layout.chair.y) / layout.chair.scale)
      assert(chairX >= 0 && chairX < chair.info.width && chairY >= 0 && chairY < chair.info.height)
      assert(chair.data[(chairY * chair.info.width + chairX) * 4 + 3] >= 240, `${actor.id}: seated hips must not show below or beside the solid shell`)
      checked++
    }
    assert(checked > 0, `${actor.id}: inspect actual hip pixels, not an empty rectangle`)
  }
})

test('shorter chair legs preserve the solid shell registration and do not resize the whole chair', async () => {
  const measure = async file => {
    const { data, info } = await sharp(new URL(`../art/classroom/${file}`, import.meta.url).pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let top = info.height, bottom = 0, left = info.width, right = 0, foot = 0
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const p = (y * info.width + x) * info.channels
      if (data[p + 3] < 240) continue
      foot = Math.max(foot, y)
      if (y > 650 || data[p + 2] < data[p] + 20 || data[p + 2] < data[p + 1]) continue
      top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, x); right = Math.max(right, x)
    }
    return { width: info.width, height: info.height, top, bottom, left, right, foot }
  }
  const original = await measure('chair-solid-v1.png'), shorter = await measure('chair-solid-v2.png')
  for (const key of ['width', 'height', 'top', 'bottom', 'left', 'right']) assert(Math.abs(original[key] - shorter[key]) <= 8, `${key}: preserve shell size and registration`)
  const ratio = (shorter.foot - shorter.bottom) / (original.foot - original.bottom)
  assert(ratio >= .78 && ratio <= .9, `legs should be modestly shorter, got ${ratio}`)
  assert.equal(CLASSROOM_ARTWORK.chair.frontFootY, shorter.foot, 'calibrate from the new foot landmark')
  assert.deepEqual(CLASSROOM_ARTWORK.chair.contact, { x: 627, y: 600 }, 'leg edit keeps the shell contact landmark')
})

test('all students leave from either side and reseat without scale changes or projection jumps', t => {
  const runtime = runtimeFor(t), pack = createClassroomPresentation('https://example.test/classroom/')
  for (const actor of runtime.readActors().filter(a => a.homeId)) for (const side of ['left', 'right']) {
    const standing = classroomCellCenter(actor.position), furniture = classroomFurnitureLayout(standing)
    let previous = pack.projectActors(runtime).find(a => a.id === actor.id)
    for (const anchor of [side, 'seat']) {
      const command = { ...base(runtime, `${actor.id}-${side}-${anchor}`), type: 'activity.start', capability: 'scene.move', participants: [{ entityId: actor.id, role: 'actor' }], params: { targetId: actor.homeId, anchor } }
      assert.equal(runtime.submit(command).status, 'running')
      for (let i = 0; i < 2000 && runtime.getRecord(command.commandId).status === 'running'; i++) {
        runtime.tick(16)
        const projected = pack.projectActors(runtime).find(a => a.id === actor.id)
        assert.equal(projected.displayHeight, previous.displayHeight)
        assert(Math.hypot(projected.position.x - previous.position.x, projected.position.y - previous.position.y) < 5, 'seat projection must not teleport')
        if (projected.intent.actionId === 'core.walk') {
          if (previous.intent.actionId === 'core.walk') assert.equal(projected.position.y, previous.position.y, 'docking walks along the floor, not diagonally onto the table')
          assert.equal(projected.position.y, standing.y, 'walking uses the clear standing lane, never the recessed chair contact')
          const deskFront = furniture.desk.y + CLASSROOM_ARTWORK.desk.frontFootY * furniture.desk.scale
          const chairFront = furniture.chair.y + CLASSROOM_ARTWORK.chair.rearFootY * furniture.chair.scale
          assert(projected.position.y - 8 * CLASSROOM_CONTENT_SCALE > deskFront && projected.position.y + 8 * CLASSROOM_CONTENT_SCALE < chairFront)
        }
        previous = projected
      }
      assert.equal(runtime.getRecord(command.commandId).status, 'completed')
    }
    assert.equal(actor.posture, 'seated')
  }
})
