import { readFile, readdir, mkdir, writeFile, realpath, rename } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { MaxRectsPacker } from 'maxrects-packer'
import { CharacterSourceSchema, CharacterManifestSchema, CharacterRegistrySchema } from '../../src/scene/characters/packSchema.ts'
import { validateCharacterStandard } from './standard.mjs'
import { assertCharacterAdmission } from './quality.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const hash = data => createHash('sha256').update(data).digest('hex').slice(0, 16)
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n')

export function alphaBounds(data, width, height) {
  let left = width, top = height, right = -1, bottom = -1
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] === 0) continue
    left = Math.min(left, x); right = Math.max(right, x)
    top = Math.min(top, y); bottom = Math.max(bottom, y)
  }
  if (right < left) throw new Error('Empty transparent frame')
  return { left, top, width: right - left + 1, height: bottom - top + 1 }
}

export async function buildCharacter(directory, { maxSize = 2048, requireAdmission = false } = {}) {
  const source = CharacterSourceSchema.parse(JSON.parse(await readFile(path.join(directory, 'character.json'), 'utf8')))
  const directoryReal = await realpath(directory)
  const files = [...new Set(Object.values(source.clips).flatMap(clip => 'frames' in clip ? clip.frames.map(frame => frame.file) : []))].sort()
  const inputs = new Map(), buffers = new Map()
  const digest = createHash('sha256').update('character-packer-v1').update(json(source)).update(String(maxSize))
  for (const file of files) {
    const target = await realpath(path.join(directory, file))
    if (!target.startsWith(directoryReal + path.sep)) throw new Error(`Frame escapes character directory: ${file}`)
    const buffer = await readFile(target)
    const { data, info } = await sharp(buffer, { limitInputPixels: 2048 * 2048 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    if (info.width !== source.canvas.width || info.height !== source.canvas.height) throw new Error(`${source.id}/${file}: expected canvas ${source.canvas.width}x${source.canvas.height}, received ${info.width}x${info.height}`)
    const bounds = alphaBounds(data, info.width, info.height)
    if (bounds.left === 0 || bounds.top === 0 || bounds.left + bounds.width === info.width || bounds.top + bounds.height === info.height) throw new Error(`${source.id}/${file}: artwork touches canvas edge; add transparent margins`)
    if (bounds.width + 4 > maxSize || bounds.height + 4 > maxSize) throw new Error(`${source.id}/${file}: frame exceeds atlas page size`)
    const cropped = await sharp(buffer).extract(bounds).png().toBuffer()
    inputs.set(file, { bounds, buffer: cropped })
    buffers.set(file, buffer)
    digest.update(file).update(buffer)
  }
  await validateCharacterStandard(directory, source, buffers)
  const admission = requireAdmission ? await assertCharacterAdmission(directory, { source, buffers }) : undefined
  const packer = new MaxRectsPacker(maxSize, maxSize, 4, { smart: true, pot: false, square: false, allowRotation: false, border: 2 })
  packer.addArray(files.map(file => ({ width: inputs.get(file).bounds.width, height: inputs.get(file).bounds.height, data: file })))
  const frames = {}, pages = [], outputs = new Map()
  for (const [index, bin] of packer.bins.entries()) {
    const layers = bin.rects.map(rect => {
      const input = inputs.get(rect.data)
      frames[rect.data] = { page: index, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, offset: { x: input.bounds.left, y: input.bounds.top } }
      return { input: input.buffer, left: rect.x, top: rect.y }
    })
    const buffer = await sharp({ create: { width: bin.width, height: bin.height, channels: 4, background: '#00000000' } }).composite(layers).png().toBuffer()
    const image = `atlas-${index}-${hash(buffer)}.png`
    pages.push({ image, width: bin.width, height: bin.height })
    outputs.set(image, buffer)
  }
  const clips = Object.fromEntries(Object.entries(source.clips).map(([name, clip]) => [name, 'alias' in clip ? clip : {
    loop: clip.loop, frames: clip.frames.map(({ file, ...metadata }) => ({ frame: file, ...metadata })),
  }]))
  const revision = digest.update(json({ pages, frames, clips })).digest('hex').slice(0, 16)
  const manifest = CharacterManifestSchema.parse({ ...source, revision, pages, frames, clips })
  const manifestFile = `manifest-${revision}.json`
  outputs.set(manifestFile, json(manifest))
  return { source, manifest, manifestFile, outputs, admission }
}

async function publish(file, buffer, check) {
  let current
  try { current = await readFile(file) } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (current?.equals(buffer)) return
  if (check) throw new Error(`Missing or stale generated resource: ${file}`)
  await mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.tmp-${process.pid}`
  await writeFile(temporary, buffer)
  await rename(temporary, file)
}

export async function buildCharacters({ sourceRoot = path.join(root, 'art/characters/packs'), outputRoot = path.join(root, 'public/characters'), check = false, maxSize = 2048, requireAdmission = true } = {}) {
  const directories = (await readdir(sourceRoot, { withFileTypes: true })).filter(entry => entry.isDirectory() && !entry.name.startsWith('.')).sort((a, b) => a.name.localeCompare(b.name, 'en'))
  const characters = [], ids = new Set()
  for (const directory of directories) {
    const built = await buildCharacter(path.join(sourceRoot, directory.name), { maxSize, requireAdmission })
    if (ids.has(built.source.id)) throw new Error(`Duplicate character ID: ${built.source.id}`)
    ids.add(built.source.id)
    for (const [file, buffer] of built.outputs) await publish(path.join(outputRoot, built.source.id, file), buffer, check)
    characters.push({ id: built.source.id, label: built.source.label, manifest: `${built.source.id}/${built.manifestFile}`, clips: Object.keys(built.source.clips) })
  }
  if (!characters.length) throw new Error('No character source packs found')
  const registry = CharacterRegistrySchema.parse({ schemaVersion: 1, characters })
  // Content-addressed files first, registry last: failed builds cannot replace a working registry.
  await publish(path.join(outputRoot, 'registry.json'), json(registry), check)
  return registry
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildCharacters({ check: process.argv.includes('--check') })
  console.log(`Character packs ${process.argv.includes('--check') ? 'verified' : 'built'}: ${result.characters.length}`)
}
