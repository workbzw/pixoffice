import { readFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { z } from 'zod'

const pixel = z.number().int().nonnegative()
export const CharacterStandardSchema = z.object({
  schemaVersion: z.literal(1),
  canvas: z.object({ width: pixel.positive(), height: pixel.positive() }).strict(),
  pivot: z.object({ x: pixel, y: pixel }).strict(),
  referenceHeight: z.number().positive(),
  displayHeight: z.number().positive(),
  tolerance: z.object({ headWidth: pixel.max(24), headCenter: pixel.max(4), foot: pixel.max(4), headAreaRatio: z.number().positive().max(.1).optional(), headHeight: pixel.max(24).optional() }).strict(),
  views: z.record(z.string(), z.object({ headWidth: pixel.positive(), headArea: pixel.positive().optional(), headHeight: pixel.positive().optional() }).strict()),
  requiredClips: z.array(z.string()).min(1),
  frames: z.record(z.string(), z.object({
    view: z.string(), headTop: pixel, headBottom: pixel, footY: pixel, headWidthTolerance: pixel.max(24).optional(),
  }).strict()),
}).strict()

// Head bands are authored landmarks, not an automatic face/head detector.
export function measureFrame(data, width, height, { headTop, headBottom }) {
  let headLeft = width, headRight = -1, footY = -1, headStart = height, headEnd = -1, headArea = 0
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] < 128) continue
    footY = Math.max(footY, y + 1)
    if (y >= headTop && y < headBottom) {
      headLeft = Math.min(headLeft, x)
      headRight = Math.max(headRight, x)
      headStart = Math.min(headStart, y); headEnd = Math.max(headEnd, y); headArea++
    }
  }
  if (headRight < headLeft) throw new Error('No opaque head pixels in the authored head band')
  return { headWidth: headRight - headLeft + 1, headHeight: headEnd - headStart + 1, headArea, headCenter: (headLeft + headRight) / 2, headTop: headStart, footY }
}

export async function validateCharacterStandard(directory, source, buffers, authoredStandard) {
  let input = authoredStandard
  if (!input) {
    try { input = JSON.parse(await readFile(path.join(directory, 'standard.json'), 'utf8')) }
    catch (error) { if (error.code === 'ENOENT') return []; throw error }
  }
  const standard = CharacterStandardSchema.parse(input)
  for (const key of ['canvas', 'pivot']) {
    for (const [name, value] of Object.entries(standard[key])) {
      if (source[key][name] !== value) throw new Error(`${source.id}: standard ${key}.${name} changed`)
    }
  }
  for (const key of ['referenceHeight', 'displayHeight']) {
    if (source[key] !== standard[key]) throw new Error(`${source.id}: standard ${key} changed`)
  }
  const checked = new Map()
  for (const name of standard.requiredClips) {
    let clip = source.clips[name]
    const seen = new Set()
    while (clip && 'alias' in clip) {
      if (seen.has(clip.alias)) throw new Error(`Standard clip alias cycle: ${name}`)
      seen.add(clip.alias)
      clip = source.clips[clip.alias]
    }
    if (!clip) throw new Error(`Missing standard clip: ${name}`)
    for (const frame of clip.frames) {
      if (checked.has(frame.file)) continue
      const rule = standard.frames[frame.file]
      if (!rule) throw new Error(`${source.id}/${name}: uncalibrated frame ${frame.file}`)
      const view = standard.views[rule.view]
      if (!view || rule.headTop >= rule.headBottom || rule.headBottom > source.canvas.height || rule.footY > source.canvas.height) {
        throw new Error(`Invalid standard landmarks: ${frame.file}`)
      }
      const buffer = buffers.get(frame.file)
      if (!buffer) throw new Error(`Missing standard frame: ${frame.file}`)
      const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      const measured = measureFrame(data, info.width, info.height, rule)
      for (const [key, expected, tolerance] of [
        ['headWidth', view.headWidth, rule.headWidthTolerance ?? standard.tolerance.headWidth],
        ['headCenter', source.pivot.x, standard.tolerance.headCenter],
        ['footY', rule.footY, standard.tolerance.foot],
      ]) {
        if (Math.abs(measured[key] - expected) > tolerance) {
          throw new Error(`${source.id}/${frame.file}: standard ${key} expected ${expected} +/- ${tolerance}, received ${measured[key]}`)
        }
      }
      if (view.headArea && standard.tolerance.headAreaRatio && Math.abs(measured.headArea / view.headArea - 1) > standard.tolerance.headAreaRatio) {
        throw new Error(`${source.id}/${frame.file}: standard headArea differs from its reference`)
      }
      if (view.headHeight && standard.tolerance.headHeight != null && Math.abs(measured.headHeight - view.headHeight) > standard.tolerance.headHeight) {
        throw new Error(`${source.id}/${frame.file}: standard headHeight differs from its reference`)
      }
      checked.set(frame.file, { file: frame.file, view: rule.view, ...measured })
    }
  }
  return [...checked.values()]
}
