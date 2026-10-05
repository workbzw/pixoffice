import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { z } from 'zod'
import { CharacterSourceSchema } from '@pixoffice/animation-frame/packSchema'
import { CharacterStandardSchema, measureFrame, validateCharacterStandard } from './standard.mjs'

const fileName = z.string().regex(/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)*\.[a-zA-Z0-9]+$/)
const digest = z.string().regex(/^[a-f0-9]{64}$/)
const rectangle = z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative(), width: z.number().int().positive(), height: z.number().int().positive() }).strict()
const registration = z.object({ scale: z.number().positive().finite(), x: z.number().int(), y: z.number().int() }).strict()
const action = z.object({
  template: z.enum(['still', 'work', 'walk', 'transition', 'gesture', 'speech', 'part']),
  reference: fileName,
  changes: z.array(rectangle).max(2).default([]),
  phases: z.array(z.string()).optional(),
  continuity: z.object({
    maxHeadStepPx: z.number().nonnegative().max(6),
    maxHeadAreaStepRatio: z.number().nonnegative().max(.035),
    maxSilhouetteChangeRatio: z.number().nonnegative().max(.45),
  }).strict().optional(),
}).strict()

export const CharacterQualitySchema = z.object({
  schemaVersion: z.literal(1),
  references: z.object({ front: fileName, right: fileName, back: fileName }).strict(),
  referenceHashes: z.object({ front: digest, right: digest, back: digest }).strict(),
  registrations: z.record(fileName, registration),
  actions: z.record(z.string(), action),
}).strict()

export const VISUAL_CHECKS = ['identity', 'motion', 'desk-contact', 'labels', 'scene']
export const CharacterReviewSchema = z.object({
  schemaVersion: z.literal(1), digest, reviewer: z.string().trim().min(1),
  reviewedAt: z.iso.datetime(),
  checks: z.object(Object.fromEntries(VISUAL_CHECKS.map(name => [name, z.literal(true)]))).strict(),
  evidence: z.array(z.object({ file: fileName, sha256: digest }).strict()).min(1).max(10),
  notes: z.string().trim().min(1),
}).strict()

export const sha256 = data => createHash('sha256').update(data).digest('hex')
const json = value => JSON.stringify(value)
const partName = name => name.startsWith('mouth.') || name.startsWith('part.')
const inside = (x, y, rect) => x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height

export async function readPackFile(directory, file) {
  fileName.parse(file)
  const root = await realpath(directory), target = await realpath(path.join(root, file))
  if (!target.startsWith(root + path.sep)) throw new Error(`File escapes character directory: ${file}`)
  return readFile(target)
}

async function optionalFile(directory, file) {
  try { return await readPackFile(directory, file) }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error }
}

export function resolveSourceClip(source, name) {
  const seen = new Set()
  while (source.clips[name] && 'alias' in source.clips[name]) {
    if (seen.has(name)) throw new Error(`Clip alias cycle: ${name}`)
    seen.add(name); name = source.clips[name].alias
  }
  return { name, clip: source.clips[name] }
}

export async function readQualityInputs(directory, supplied) {
  const source = supplied?.source ?? CharacterSourceSchema.parse(JSON.parse(await readPackFile(directory, 'character.json')))
  const buffers = supplied?.buffers ?? new Map()
  for (const clip of Object.values(source.clips)) if ('frames' in clip) for (const frame of clip.frames) {
    if (!buffers.has(frame.file)) buffers.set(frame.file, await readPackFile(directory, frame.file))
  }
  const standardBytes = await optionalFile(directory, 'standard.json')
  const qualityBytes = await optionalFile(directory, 'quality.json')
  // Bind approvals and legacy compatibility to actual pixels and all authoring rules.
  const hash = createHash('sha256').update('office-character-admission-v1\n').update(json(source))
  hash.update('\nstandard\n').update(standardBytes ?? '<missing>')
  hash.update('\nquality\n').update(qualityBytes ?? '<missing>')
  for (const [file, bytes] of [...buffers].sort(([a], [b]) => a.localeCompare(b, 'en'))) hash.update('\n' + file + '\n').update(bytes)
  return { source, buffers, standardBytes, qualityBytes, digest: hash.digest('hex') }
}

function expectedTemplate(name) {
  if (partName(name)) return 'part'
  if (name.startsWith('work.')) return 'work'
  if (name.startsWith('walk.') || name.startsWith('run.')) return 'walk'
  if (name.startsWith('stand-up.') || name.startsWith('sit-down.')) return 'transition'
  if (name.startsWith('idle.') || name.startsWith('sit.') || name.startsWith('talk.seated-')) return 'still'
  if (name.startsWith('speak.')) return 'speech'
  return 'gesture'
}

/** Compare actual visible RGBA pixels, ignoring irrelevant RGB in fully transparent pixels. */
export function compareFrames(reference, current, width, changes = []) {
  let outsideChanges = 0, changed = 0, silhouette = 0, union = 0
  const regionChanges = changes.map(() => 0)
  for (let i = 0; i < reference.length; i += 4) {
    const opaqueA = reference[i + 3] >= 128, opaqueB = current[i + 3] >= 128
    if (opaqueA || opaqueB) union++
    if (opaqueA !== opaqueB) silhouette++
    const differs = reference[i + 3] !== current[i + 3] ||
      ((reference[i + 3] || current[i + 3]) && [0, 1, 2].some(channel => reference[i + channel] !== current[i + channel]))
    if (!differs) continue
    changed++
    const pixel = i / 4, x = pixel % width, y = Math.floor(pixel / width)
    const region = changes.findIndex(rect => inside(x, y, rect))
    if (region < 0) outsideChanges++
    else regionChanges[region]++
  }
  return { changed, outsideChanges, regionChanges, silhouetteRatio: union ? silhouette / union : 0 }
}

/** Read-only: failed candidates produce diagnostics; they never rewrite the active pack. */
export async function inspectCharacterQuality(directory, supplied) {
  const input = supplied?.digest ? supplied : await readQualityInputs(directory, supplied)
  const { source, buffers } = input
  const report = { schemaVersion: 1, id: source.id, digest: input.digest, passed: false, issues: [], actions: [] }
  const issue = (code, message, extra = {}) => report.issues.push({ code, message, ...extra })
  if (!input.standardBytes) issue('standard.missing', 'A new or changed character requires standard.json')
  if (!input.qualityBytes) issue('quality.missing', 'Missing quality.json: actions, references and registration records are required')
  if (report.issues.length) return report
  let standard, quality
  try { standard = CharacterStandardSchema.parse(JSON.parse(input.standardBytes)); quality = CharacterQualitySchema.parse(JSON.parse(input.qualityBytes)) }
  catch (error) { issue('contract.invalid', error.message); return report }
  if (source.canvas.width !== 256 || source.canvas.height !== 384 || source.pivot.x !== 128 || source.pivot.y !== 344 || source.referenceHeight !== 280 || source.displayHeight !== 84) {
    issue('profile.dimensions', 'Office admission requires canvas 256x384, pivot (128,344), referenceHeight 280 and displayHeight 84')
  }
  for (const [name, max] of Object.entries({ headWidth: 14, headHeight: 16, headCenter: 2, foot: 2, headAreaRatio: .035 })) {
    if (standard.tolerance[name] == null || standard.tolerance[name] > max) issue('standard.tolerance', `Missing or weakened ${name} tolerance`)
  }
  for (const [view, rule] of Object.entries(standard.views)) {
    if (!rule.headArea || !rule.headHeight) issue('standard.reference', `Missing head area/height reference for ${view}`)
  }
  if (source.profile !== 'office' || !source.clips['work.quiet-back']) issue('profile.actions', 'Admission requires an office pack with a dedicated work.quiet-back clip')
  for (const [view, file] of Object.entries(quality.references)) {
    const bytes = buffers.get(file)
    const idle = resolveSourceClip(source, `idle.${view}`).clip
    if (!bytes || !idle?.frames.some(frame => frame.file === file)) issue('reference.missing', `${view} reference must be an active standing frame: ${file}`)
    else if (sha256(bytes) !== quality.referenceHashes[view]) issue('reference.changed', `${view} identity reference changed without renewed authoring review`)
    const rule = standard.frames[file], target = standard.views[view]
    if (!rule || rule.view !== view || !target) issue('reference.landmarks', `Missing ${view} reference landmarks`)
    else if (bytes) {
      const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      const measured = measureFrame(data, info.width, info.height, rule)
      if (['headWidth', 'headHeight', 'headArea'].some(key => measured[key] !== target[key])) issue('reference.measurements', `${view} standard must be measured from the locked reference image`)
    }
  }
  const covered = new Set(standard.requiredClips.map(name => resolveSourceClip(source, name).name))
  for (const name of Object.keys(quality.actions)) if (!source.clips[name] || 'alias' in source.clips[name]) issue('action.unknown', `Rules must refer to a direct active clip: ${name}`)
  for (const [name, original] of Object.entries(source.clips)) {
    const resolved = resolveSourceClip(source, name)
    const contract = quality.actions[resolved.name]
    if (!contract) { issue('action.uncovered', `Missing action contract: ${name}`); continue }
    // Aliases cannot disguise a body action as a part or bypass its action policy.
    const expected = expectedTemplate(name)
    if (contract.template !== expected && !(name.startsWith('speak.') && contract.template === 'still')) issue('action.template', `${name} requires the ${expected} template`)
    if (!partName(name) && !covered.has(resolved.name)) issue('standard.uncovered', `Active body clip is absent from requiredClips: ${name}`)
    if ('alias' in original) continue
    const files = [...new Set(original.frames.map(frame => frame.file))]
    const referenceIndex = files.indexOf(contract.reference)
    if (referenceIndex < 0) { issue('action.reference', `Reference is not part of ${name}`); continue }
    const registrations = files.map(file => quality.registrations[file])
    if (registrations.some(record => !record)) issue('registration.missing', `Missing source registration record in ${name}`)
    else {
      const first = registrations[referenceIndex]
      if (registrations.some(record => record.scale !== first.scale)) issue('registration.scale', `${name} must use one import scale across its frames`)
      if (['still', 'work', 'speech'].includes(contract.template) && registrations.some(record => record.x !== first.x || record.y !== first.y)) issue('registration.position', `${name} must keep one body registration offset`)
    }
    const regions = contract.changes
    if (regions.some(rect => rect.x + rect.width > source.canvas.width || rect.y + rect.height > source.canvas.height) ||
      regions.reduce((area, rect) => area + rect.width * rect.height, 0) > source.canvas.width * source.canvas.height * .08) {
      issue('mask.bounds', `${name}: changing regions must stay in bounds and cover at most 8% of the canvas`); continue
    }
    if (contract.template === 'still' && regions.length) issue('mask.still', `${name}: a still pose cannot contain changing regions`)
    if (contract.template === 'work' && (regions.length !== 2 || regions[0].x + regions[0].width > 108 || regions[1].x < 148)) {
      issue('mask.work', `${name}: mark small left and right finger regions; preserve the central head/body strip`)
    }
    const raws = [], measures = []
    for (const file of files) {
      const { data, info } = await sharp(buffers.get(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      if (info.width !== source.canvas.width || info.height !== source.canvas.height) { issue('frame.dimensions', `Wrong canvas: ${file}`); continue }
      raws.push(data)
      const rule = standard.frames[file]
      measures.push(rule && !partName(name) ? measureFrame(data, info.width, info.height, rule) : undefined)
    }
    if (raws.length !== files.length) continue
    const reference = raws[referenceIndex]
    const metrics = { name, frames: files.length, outsideChanges: 0, maxHeadStepPx: 0, maxHeadAreaStepRatio: 0, maxSilhouetteChangeRatio: 0 }
    if (['still', 'work', 'speech'].includes(contract.template)) {
      const changedRegions = regions.map(() => 0)
      for (const [index, raw] of raws.entries()) {
        const diff = compareFrames(reference, raw, source.canvas.width, regions)
        metrics.outsideChanges += diff.outsideChanges
        diff.regionChanges.forEach((count, region) => { changedRegions[region] += count })
        if (diff.outsideChanges) issue('pixels.static', `${name}/${files[index]}: ${diff.outsideChanges} pixels changed outside allowed regions`, { clip: name, file: files[index] })
      }
      if (contract.template === 'work' && (!original.loop || changedRegions.length !== 2 || changedRegions.some(count => count === 0))) issue('work.motion', `${name}: both finger regions must animate in a loop`)
    }
    if (['walk', 'transition', 'gesture'].includes(contract.template)) {
      if (!contract.continuity) issue('continuity.missing', `Missing adjacent-frame limits: ${name}`)
      if (contract.template === 'walk') {
        if (!original.loop || files.length !== 4 || json(contract.phases) !== json(['left-contact', 'left-pass', 'right-contact', 'right-pass']) || new Set(raws.map(sha256)).size !== 4) issue('walk.phases', `${name}: requires four distinct alternating contact/pass poses`)
      }
      if (contract.template === 'transition' && original.loop) issue('transition.loop', `${name}: sit/rise transitions cannot loop`)
      const sequence = original.frames.map(frame => files.indexOf(frame.file))
      const pairs = sequence.slice(1).map((index, i) => [sequence[i], index])
      if (original.loop) pairs.push([sequence.at(-1), sequence[0]])
      for (const [from, to] of pairs) {
        const a = measures[from], b = measures[to]
        metrics.maxSilhouetteChangeRatio = Math.max(metrics.maxSilhouetteChangeRatio, compareFrames(raws[from], raws[to], source.canvas.width).silhouetteRatio)
        if (!a || !b) continue
        // Sit/rise intentionally changes vertical position, but never head scale.
        metrics.maxHeadStepPx = Math.max(metrics.maxHeadStepPx, Math.abs(a.headCenter - b.headCenter), contract.template === 'transition' ? 0 : Math.abs(a.headTop - b.headTop))
        metrics.maxHeadAreaStepRatio = Math.max(metrics.maxHeadAreaStepRatio, Math.abs(a.headArea / b.headArea - 1))
      }
      if (contract.continuity) for (const key of Object.keys(contract.continuity)) {
        if (metrics[key] > contract.continuity[key]) issue('continuity.jump', `${name}: ${key} ${metrics[key].toFixed(4)} exceeds ${contract.continuity[key]}`, { clip: name })
      }
    }
    report.actions.push(metrics)
  }
  try { await validateCharacterStandard(directory, source, buffers, standard) }
  catch (error) { issue('standard.failed', error.message) }
  report.passed = report.issues.length === 0
  return report
}

export async function validateVisualReview(directory, contentDigest) {
  const bytes = await optionalFile(directory, 'review.json')
  if (!bytes) throw new Error('Missing review.json: visual acceptance is required before publication')
  const review = CharacterReviewSchema.parse(JSON.parse(bytes))
  if (review.digest !== contentDigest) throw new Error('Visual review is stale: character pixels, configuration or quality rules changed')
  for (const evidence of review.evidence) {
    if (!/\.(png|gif|webp|jpe?g)$/i.test(evidence.file)) throw new Error('Review evidence must be an image or animation')
    if (sha256(await readPackFile(directory, evidence.file)) !== evidence.sha256) throw new Error(`Visual evidence changed: ${evidence.file}`)
  }
  return review
}

export async function assertCharacterAdmission(directory, supplied) {
  const input = await readQualityInputs(directory, supplied)
  const legacy = JSON.parse(await readFile(new URL('./legacy-baseline.json', import.meta.url), 'utf8'))
  if (legacy.characters[input.source.id] === input.digest) return { status: 'legacy-frozen', id: input.source.id, digest: input.digest }
  const report = await inspectCharacterQuality(directory, input)
  if (!report.passed) throw new Error(`${input.source.id}: admission rejected\n${report.issues.map(issue => `${issue.code}: ${issue.message}`).join('\n')}`)
  await validateVisualReview(directory, input.digest)
  return { status: 'approved', id: input.source.id, digest: input.digest }
}
