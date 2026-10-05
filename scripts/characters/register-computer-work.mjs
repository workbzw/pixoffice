import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { createServer } from 'vite'
import { measureFrame, validateCharacterStandard } from './standard.mjs'
import { rejectLegacyPublication } from './legacy-authoring.mjs'

if (process.argv.includes('--publish')) rejectLegacyPublication()

const root = fileURLToPath(new URL('../../', import.meta.url))
const art = path.join(root, 'art/characters/office-computer-work-v1')
const staging = path.join(root, '.character-staging/computer-work-v1')
const recipe = JSON.parse(await readFile(path.join(art, 'registration.json'), 'utf8'))
const json = value => JSON.stringify(value, null, 2) + '\n'
const server = await createServer({ root, configFile: false, server: { middlewareMode: true } })
try {
  const { detectApartmentFrames } = await server.ssrLoadModule('/example/office-web/src/scene/characters/apartmentFrames.ts')
  const { CharacterSourceSchema } = await server.ssrLoadModule('/example/office-web/src/scene/characters/packSchema.ts')
  const { workstationSurface } = await server.ssrLoadModule('/example/office-web/src/scene/layout/workstationSurface.ts')
  const { transformWorkSurface } = await server.ssrLoadModule('/example/office-web/src/scene/characters/workSurface.ts')
  const { canUseWorkSurface } = await server.ssrLoadModule('/example/office-web/src/scene/characters/workAnimation.ts')
  const sheets = {}
  for (const name of ['body', 'arms']) {
    const file = path.join(art, `${name}-source.png`)
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    sheets[name] = { file, crops: detectApartmentFrames(data, info.width, info.height, name === 'body' ? 2 : 6, 3) }
  }
  const prepared = []
  for (const [row, entry] of recipe.rows.entries()) {
    const directory = path.join(root, 'art/characters/packs', entry.id)
    const source = JSON.parse(await readFile(path.join(directory, 'character.json'), 'utf8'))
    const standard = JSON.parse(await readFile(path.join(directory, 'standard.json'), 'utf8'))
    const outputs = new Map(), records = []
    const composite = async (input, width, height, left, top) => {
      if (left < 0 || top < 0 || left + width > source.canvas.width || top + height > source.canvas.height) throw new Error(`${entry.id}: outside canvas`)
      const resized = await sharp(input).resize(width, height).png().toBuffer()
      return sharp({ create: { ...source.canvas, channels: 4, background: '#00000000' } }).composite([{ input: resized, left, top }]).png().toBuffer()
    }
    const crop = sheets.body.crops[row]
    const input = await sharp(sheets.body.file).extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height }).png().toBuffer()
    const raw = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const headBottom = entry.headBottom - crop.y
    const measured = measureFrame(raw.data, raw.info.width, raw.info.height, { headTop: 0, headBottom })
    const scale = Math.sqrt(standard.views.back.headArea / measured.headArea)
    const width = Math.round(crop.width * scale), height = Math.round(crop.height * scale)
    const sx = width / crop.width, sy = height / crop.height
    const left = Math.round(source.pivot.x - (measured.headCenter + .5) * sx + .5), top = Math.round(377 - measured.footY * sy)
    const bodyFile = 'work/computer-v1/body.png'
    outputs.set(bodyFile, await composite(input, width, height, left, top))
    standard.frames[bodyFile] = { view: 'back', headTop: top, headBottom: Math.round(top + headBottom * sy), footY: 377 }
    source.clips['work.computer-back'] = { frames: [{ file: bodyFile, durationMs: 12000 }], loop: true }
    if (!standard.requiredClips.includes('work.computer-back')) standard.requiredClips.push('work.computer-back')
    const anchor = ([x, y]) => ({ x: +(left + (x - crop.x) * sx).toFixed(3), y: +(top + (y - crop.y) * sy).toFixed(3) })
    const displayScale = source.displayHeight / source.referenceHeight
    source.work = { shoulders: { left: anchor(entry.shoulders[0]), right: anchor(entry.shoulders[1]) },
      previewSurface: transformWorkSurface(workstationSurface('classic'), 1 / displayScale, source.pivot.x, source.pivot.y - 45 / displayScale) }
    records.push({ file: bodyFile, crop, scale, left, top, headBottom: entry.headBottom })
    for (const [column, part] of recipe.parts.entries()) {
      const c = sheets.arms.crops[row * 3 + column]
      const image = await sharp(sheets.arms.file).extract({ left: c.x, top: c.y, width: c.width, height: c.height }).png().toBuffer()
      const length = Math.hypot((part.tip[0] - part.root[0]) * c.width, (part.tip[1] - part.root[1]) * c.height)
      const partScale = part.length / length
      const w = Math.round(c.width * partScale), h = Math.round(c.height * partScale)
      const x = Math.round(128 - part.root[0] * w), y = Math.round(160 - part.root[1] * h)
      const file = `work/computer-v1/${part.name}.png`, clip = `part.work-${part.name}`
      outputs.set(file, await composite(image, w, h, x, y))
      source.clips[clip] = { frames: [{ file, durationMs: 1000 }], loop: false }
      source.work[part.name] = { clip, root: { x: x + part.root[0] * w, y: y + part.root[1] * h }, tip: { x: x + part.tip[0] * w, y: y + part.tip[1] * h } }
      records.push({ file, crop: c, scale: partScale, left: x, top: y })
    }
    CharacterSourceSchema.parse(source)
    for (const artwork of ['classic', 'trial']) {
      const surface = transformWorkSurface(workstationSurface(artwork), 1 / displayScale, source.pivot.x, source.pivot.y - 45 / displayScale)
      if (!canUseWorkSurface(source.work, surface)) throw new Error(`${entry.id}: cannot reach ${artwork} workstation`)
    }
    const buffers = new Map(outputs)
    for (const name of Object.keys(standard.frames)) if (!buffers.has(name)) buffers.set(name, await readFile(path.join(directory, name)))
    await validateCharacterStandard(directory, source, buffers, standard)
    prepared.push({ id: entry.id, directory, source, standard, outputs, records })
  }
  for (const item of prepared) {
    const stage = path.join(staging, item.id)
    await mkdir(stage, { recursive: true }); await cp(item.directory, stage, { recursive: true })
    for (const target of [stage, ...(process.argv.includes('--publish') ? [item.directory] : [])]) {
      for (const [file, buffer] of item.outputs) { await mkdir(path.dirname(path.join(target, file)), { recursive: true }); await writeFile(path.join(target, file), buffer) }
      await writeFile(path.join(target, 'character.json'), json(item.source)); await writeFile(path.join(target, 'standard.json'), json(item.standard))
    }
  }
  await writeFile(path.join(art, 'registered-frames.json'), json(prepared.map(({ id, records }) => ({ id, records }))))
  await sharp({ create: { width: 1280, height: 2304, channels: 4, background: '#ffffff' } }).composite(prepared.flatMap((item, row) => [
    { input: path.join(item.directory, 'standard-v2/sit/back/001.png'), left: 0, top: row * 384 },
    ...[...item.outputs.values()].map((input, i) => ({ input, left: (i + 1) * 256, top: row * 384 })),
  ])).png().toFile(path.join(art, 'comparison.png'))
  console.log(`${prepared.length} computer work rigs ${process.argv.includes('--publish') ? 'published' : 'staged'}`)
} finally { await server.close() }
