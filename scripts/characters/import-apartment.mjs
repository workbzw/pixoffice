import { mkdir, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { createServer } from 'vite'
import { CharacterSourceSchema } from '@pixoffice/animation-frame/packSchema'
import { registerMarvisPoses } from './register-marvis-poses.mjs'
import { rejectLegacyPublication } from './legacy-authoring.mjs'

rejectLegacyPublication()

// One-time migration of existing artwork, not part of normal builds.
const root = fileURLToPath(new URL('../../', import.meta.url))
const destination = path.join(root, 'art/characters/packs')
const legacy = path.join(root, 'public/assets/characters/apartment')
const canvas = { width: 256, height: 384 }, pivot = { x: 128, y: 344 }, referenceHeight = 280
const ids = ['marvis', 'code-agent', 'file-agent', 'app-agent', 'review-agent', 'data-agent']
const labels = ['王明', '李研', '周理', '陈书', '刘市', '赵审']
for (const id of ids) {
  try { await access(path.join(destination, id)); throw new Error(`Refusing to overwrite existing source pack: ${id}`) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
}
const server = await createServer({ root, configFile: false, server: { middlewareMode: true }, appType: 'custom' })
try {
  const { detectApartmentFrames, registerWalkFrames, BACK_WALK_FRAMES } = await server.ssrLoadModule('/example/office-web/src/scene/characters/apartmentFrames.ts')
  async function read(name, rows, columns = 3) {
    const file = path.join(legacy, name)
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    return { file, data, width: info.width, height: info.height, frames: detectApartmentFrames(data, info.width, info.height, rows, columns) }
  }
  const seated = await read('seated.png', 2), turns = await read('seated-turn-right-v1.png', 2)
  const transitions = await read('seat-transition-v1.png', 4), indoor = await read('indoor-back-walk-v1.png', 6, 4)
  for (const [row, id] of ids.entries()) {
    const directory = path.join(destination, id), base = await read(`${id}.png`, 4)
    const clips = {}
    async function writeFrame(sheet, frame, file, scale, x, y) {
      const image = await sharp(sheet.file).extract({ left: frame.x, top: frame.y, width: frame.width, height: frame.height })
        .resize(Math.round(frame.width * scale), Math.round(frame.height * scale)).png().toBuffer()
      await mkdir(path.dirname(path.join(directory, file)), { recursive: true })
      await sharp({ create: { ...canvas, channels: 4, background: '#00000000' } }).composite([{ input: image, left: Math.round(x), top: Math.round(y) }]).png().toFile(path.join(directory, file))
    }
    async function single(sheet, index, name, height = 280, footY = 0) {
      const frame = sheet.frames[index], scale = height / frame.height, file = `${name.replaceAll('.', '/')}/001.png`
      await writeFrame(sheet, frame, file, scale, pivot.x - frame.width * scale / 2, pivot.y + footY - frame.height * scale)
      clips[name] = { loop: false, frames: [{ file, durationMs: 1000 }] }
      return file
    }
    async function registered(sheet, selected, name, durationMs) {
      const registration = registerWalkFrames(sheet.data, sheet.width, sheet.height, selected.map(index => sheet.frames[index]))
      const scale = referenceHeight / registration.frameSize.height
      const frames = []
      for (const [index, frame] of registration.frames.entries()) {
        const file = `${name.replaceAll('.', '/')}/${String(index + 1).padStart(3, '0')}.png`, offset = registration.offsets[index]
        await writeFrame(sheet, frame, file, scale, pivot.x - registration.frameSize.width * scale / 2 + offset.x * scale, pivot.y - registration.frameSize.height * scale + offset.y * scale)
        frames.push({ file, durationMs })
      }
      clips[name] = { loop: true, frames }
    }
    for (const [direction, index] of [['front', 0], ['right', 3], ['back', 6]]) {
      await single(base, index, `idle.${direction}`)
      if (direction !== 'back') await registered(base, [index + 1, index, index + 2, index], `walk.${direction}`, 125)
    }
    clips['idle.left'] = { alias: 'idle.right', mirrorX: true }
    clips['walk.left'] = { alias: 'walk.right', mirrorX: true }
    await registered(indoor, [0, 1, 2, 3].map(index => row * 4 + index), 'walk.back', 250)
    const running = await read(`back-walk-v1/${id}.png`, 2, 4)
    await registered(running, BACK_WALK_FRAMES[id], 'run.back', 200)
    for (const [name, index] of [['wave', 9], ['thinking', 10], ['surprised', 11]]) await single(base, index, `emote.${name}`)
    const seatedFile = await single(seated, row, 'sit.back', 72 / 84 * referenceHeight, 10 / 84 * referenceHeight)
    await single(turns, row, 'talk.seated-right', 72 / 84 * referenceHeight, 10 / 84 * referenceHeight)
    clips['talk.seated-left'] = { alias: 'talk.seated-right', mirrorX: true }
    const lean = await single(transitions, row, 'pose.lean', 74 / 84 * referenceHeight, 8 / 84 * referenceHeight)
    const rise = await single(transitions, row + 6, 'pose.rise', 80 / 84 * referenceHeight, 3 / 84 * referenceHeight)
    const up = [{ file: seatedFile, durationMs: 52 }, { file: lean, durationMs: 182 }, { file: rise, durationMs: 224 }, { file: clips['idle.back'].frames[0].file, durationMs: 62 }]
    clips['stand-up.back'] = { loop: false, frames: up }
    clips['sit-down.back'] = { loop: false, frames: [...up].reverse() }
    if (id === 'marvis') {
      for (const direction of ['front', 'right', 'back']) await registered(await read(`marvis-walk-${direction}.png`, 2, 4), [0, 1, 2, 3, 4, 5, 6, 7], `archive-walk.${direction}`, 125)
      clips['archive-walk.left'] = { alias: 'archive-walk.right', mirrorX: true }
    }
    const source = CharacterSourceSchema.parse({ schemaVersion: 1, id, label: labels[row], profile: 'office', canvas, pivot, referenceHeight, displayHeight: 84, portrait: 'idle.front', clips })
    await writeFile(path.join(directory, 'character.json'), JSON.stringify(source, null, 2) + '\n')
    console.log(`Imported ${id}`)
  }
  await registerMarvisPoses()
} finally { await server.close() }
