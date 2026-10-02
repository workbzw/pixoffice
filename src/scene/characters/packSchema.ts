import { z } from 'zod'
import { sampleComputerWork, sampleQuietWork, QUIET_WORK_CYCLE_MS, WORK_CYCLE_MS } from './workAnimation.ts'
import { validWorkSurface, type WorkSurface } from './workSurface.ts'
import { OFFICE_SEATED_CLIPS } from '../../contracts/characterPose.ts'

const id = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/)
const clipName = z.string().regex(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/)
const relativeFile = z.string().regex(/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.png$/)
const atlasFile = z.string().regex(/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.(?:png|webp)$/)
const size = z.object({ width: z.number().int().positive().max(2048), height: z.number().int().positive().max(2048) }).strict()
const point = z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() }).strict()
const rect = size.extend({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() })
const alias = z.object({ alias: clipName, mirrorX: z.boolean().default(false) }).strict()
const mouthAttachment = z.object({
  x: z.number().finite().nonnegative(), y: z.number().finite().nonnegative(), view: id,
  scale: z.number().positive().max(4).default(1), rotation: z.number().min(-180).max(180).default(0),
}).strict()
const mouthRig = z.object({
  pivot: point,
  views: z.record(id, z.object({ closed: clipName, speaking: clipName }).strict()),
}).strict()
const workPoint = z.object({ x: z.number().finite(), y: z.number().finite() }).strict()
const armPart = z.object({ clip: clipName, root: workPoint, tip: workPoint }).strict()
const workRig = z.object({
  shoulders: z.object({ left: workPoint, right: workPoint }).strict(),
  upper: armPart, forearm: armPart, hand: armPart,
  previewSurface: z.object({ keyboardLeft: workPoint, keyboardRight: workPoint, mouse: workPoint,
    bounds: z.object({ left: z.number().finite(), right: z.number().finite(), back: z.number().finite(), front: z.number().finite() }).strict(),
  }).strict(),
}).strict()
const timing = z.object({ durationMs: z.number().int().positive().max(60000), mouth: mouthAttachment.optional() }).strict()
const sourceClip = z.union([
  alias,
  z.object({ frames: z.array(timing.extend({ file: relativeFile })).min(1).max(600), loop: z.boolean() }).strict(),
])
const packedClip = z.union([
  alias,
  z.object({ frames: z.array(timing.extend({ frame: relativeFile })).min(1).max(600), loop: z.boolean() }).strict(),
])
const common = {
  schemaVersion: z.literal(1), id, label: z.string().min(1).max(80),
  profile: z.enum(['basic', 'office']), canvas: size, pivot: point,
  referenceHeight: z.number().positive().max(2048), displayHeight: z.number().positive().max(512),
  portrait: clipName, mouth: mouthRig.optional(), work: workRig.optional(),
}

type ClipGraph = Record<string, { alias: string; mirrorX: boolean } | { frames: { mouth?: z.infer<typeof mouthAttachment> }[]; loop: boolean }>
function validateCommon(value: { canvas: { width: number; height: number }; pivot: { x: number; y: number }; referenceHeight: number; profile: string; portrait: string; clips: ClipGraph; mouth?: z.infer<typeof mouthRig>; work?: z.infer<typeof workRig> }, ctx: z.RefinementCtx) {
  const problem = (message: string) => ctx.addIssue({ code: 'custom', message })
  if (value.pivot.x > value.canvas.width || value.pivot.y > value.canvas.height || value.referenceHeight > value.canvas.height) problem('Canvas, pivot and reference height are inconsistent')
  const required = ['idle.front', 'idle.back', 'idle.left', 'idle.right', 'walk.front', 'walk.back', 'walk.left', 'walk.right', value.portrait]
  if (value.profile === 'office') required.push(...OFFICE_SEATED_CLIPS, 'sit-down.back', 'stand-up.back')
  for (const name of required) if (!Object.hasOwn(value.clips, name)) problem(`Missing required clip: ${name}`)
  for (const name of Object.keys(value.clips)) {
    let current = name
    const seen = new Set<string>()
    while (true) {
      if (seen.has(current)) { problem(`Clip alias cycle: ${name}`); break }
      seen.add(current)
      const clip = value.clips[current]
      if (!clip) { problem(`Missing clip alias target: ${current}`); break }
      if (!('alias' in clip)) break
      current = clip.alias
    }
    const clip = value.clips[name]
    if (!('frames' in clip)) continue
    for (const frame of clip.frames) if (frame.mouth) {
      if (!value.mouth?.views[frame.mouth.view]) problem(`Missing mouth view in ${name}: ${frame.mouth.view}`)
      if (frame.mouth.x > value.canvas.width || frame.mouth.y > value.canvas.height) problem(`Out-of-bounds mouth attachment: ${name}`)
    }
  }
  if (value.mouth) {
    if (value.mouth.pivot.x > value.canvas.width || value.mouth.pivot.y > value.canvas.height) problem('Out-of-bounds mouth pivot')
    for (const view of Object.values(value.mouth.views)) for (const name of [view.closed, view.speaking]) {
      if (!Object.hasOwn(value.clips, name)) problem(`Missing mouth clip: ${name}`)
    }
  }
  if (value.work) {
    if (!validWorkSurface(value.work.previewSurface)) problem('Invalid work preview surface')
    if (!value.clips['work.computer-back']) problem('Missing computer work body clip')
    for (const part of [value.work.upper, value.work.forearm, value.work.hand]) {
      const clip = value.clips[part.clip]
      if (!clip) problem(`Missing work part: ${part.clip}`)
      else if (!('frames' in clip) || clip.frames.length !== 1) problem(`Work parts require a single direct frame: ${part.clip}`)
      if (Math.hypot(part.tip.x - part.root.x, part.tip.y - part.root.y) < 1) problem(`Invalid work part length: ${part.clip}`)
    }
    for (const p of [...Object.values(value.work.shoulders), ...[value.work.upper, value.work.forearm, value.work.hand].flatMap(part => [part.root, part.tip])]) {
      if (p.x < 0 || p.y < 0 || p.x > value.canvas.width || p.y > value.canvas.height) problem('Out-of-bounds work anchor')
    }
  }
}

export const CharacterSourceSchema = z.object({ ...common, clips: z.record(clipName, sourceClip) }).strict().superRefine(validateCommon)
export const CharacterManifestSchema = z.object({
  ...common, revision: z.string().regex(/^[a-f0-9]{16}$/),
  pages: z.array(size.extend({ image: atlasFile, group: z.enum(['startup', 'deferred']).optional() })).min(1).max(64),
  frames: z.record(relativeFile, z.object({ page: z.number().int().nonnegative(), rect, offset: point }).strict()),
  clips: z.record(clipName, packedClip),
}).strict().superRefine((value, ctx) => {
  validateCommon(value, ctx)
  for (const [name, frame] of Object.entries(value.frames)) {
    const page = value.pages[frame.page]
    if (!page || frame.rect.x + frame.rect.width > page.width || frame.rect.y + frame.rect.height > page.height ||
      frame.offset.x + frame.rect.width > value.canvas.width || frame.offset.y + frame.rect.height > value.canvas.height) {
      ctx.addIssue({ code: 'custom', message: `Out-of-bounds frame: ${name}` })
    }
  }
  for (const [name, clip] of Object.entries(value.clips)) {
    if ('alias' in clip) continue
    for (const frame of clip.frames) if (!Object.hasOwn(value.frames, frame.frame)) ctx.addIssue({ code: 'custom', message: `Missing frame in ${name}: ${frame.frame}` })
  }
})
export const CharacterRegistrySchema = z.object({
  schemaVersion: z.literal(1),
  characters: z.array(z.object({ id, label: z.string(), manifest: z.string().regex(/^[a-z][a-z0-9-]*\/manifest-[a-f0-9]{16}\.json$/), clips: z.array(clipName),
    portrait: z.object({ image: atlasFile, canvas: size, referenceHeight: z.number().positive().max(2048) }).strict().optional(),
  }).strict()),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.characters.map(entry => entry.id)).size !== value.characters.length) ctx.addIssue({ code: 'custom', message: 'Duplicate character IDs' })
})

export type CharacterSource = z.infer<typeof CharacterSourceSchema>
export type CharacterManifest = z.infer<typeof CharacterManifestSchema>
export type CharacterRegistry = z.infer<typeof CharacterRegistrySchema>

export function resolveCharacterClip(manifest: Pick<CharacterManifest, 'clips'>, requested: string) {
  let name = requested
  let clip = manifest.clips[name]
  let fallback = false
  if (!clip) {
    const direction = requested.split('.').at(-1) ?? 'front'
    // A missing run may walk; a missing seated pose must never become a fake sit.
    name = requested.startsWith('run.') ? `walk.${direction}` : requested.startsWith('emote.') ? 'idle.front' : ''
    clip = manifest.clips[name]
    fallback = true
  }
  let mirrorX = false
  const seen = new Set<string>()
  while (clip && 'alias' in clip) {
    if (seen.has(name)) return undefined
    seen.add(name)
    mirrorX = mirrorX !== clip.mirrorX
    name = clip.alias
    clip = manifest.clips[name]
  }
  return clip && !('alias' in clip) ? { ...clip, name, requested, mirrorX, fallback } : undefined
}

/** Include every body, mouth and generated-work dependency before a pose can render. */
export function characterFrameDependencies(manifest: Pick<CharacterManifest, 'clips' | 'mouth' | 'work'>, names: string[]) {
  const keys = new Set<string>(), visited = new Set<string>()
  const visit = (name: string) => {
    if (visited.has(name)) return
    visited.add(name)
    if (manifest.work && (name === 'work.computer-back' || name === 'work.quiet-back' && !manifest.clips[name])) {
      if (name === 'work.quiet-back') visit('work.computer-back')
      for (const part of [manifest.work.upper, manifest.work.forearm, manifest.work.hand]) visit(part.clip)
    }
    const clip = resolveCharacterClip(manifest, name)
    for (const frame of clip?.frames ?? []) {
      keys.add(frame.frame)
      const mouth = frame.mouth && manifest.mouth?.views[frame.mouth.view]
      if (mouth) { visit(mouth.closed); visit(mouth.speaking) }
    }
  }
  names.forEach(visit)
  return [...keys]
}

export function sampleCharacterClip(manifest: CharacterManifest, name: string, elapsedMs = 0, progress?: number) {
  const clip = resolveCharacterClip(manifest, name)
  if (!clip) return undefined
  const durationMs = clip.frames.reduce((sum, frame) => sum + frame.durationMs, 0)
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0
  const time = progress != null ? Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0)) * durationMs
    : clip.loop ? elapsed % durationMs : Math.min(durationMs, elapsed)
  let end = 0
  let index = clip.frames.length - 1
  for (let i = 0; i < clip.frames.length; i++) {
    end += clip.frames[i].durationMs
    if (time < end) { index = i; break }
  }
  const key = clip.frames[index].frame
  return { key, frame: manifest.frames[key], index, clip, durationMs, completed: !clip.loop && time >= durationMs }
}

/** Body timing and speech timing are independent; attachments belong to the sampled body frame. */
export function sampleCharacterLayers(manifest: CharacterManifest, name: string, elapsedMs = 0, progress?: number, speechElapsedMs?: number, surface?: WorkSurface) {
  const generatedQuiet = name === 'work.quiet-back' && !manifest.clips[name] && Boolean(manifest.work)
  const work = manifest.work && (generatedQuiet
    ? sampleQuietWork(manifest.work, surface ?? manifest.work.previewSurface, elapsedMs)
    : name === 'work.computer-back' ? sampleComputerWork(manifest.work, surface ?? manifest.work.previewSurface, elapsedMs) : undefined)
  const bodyName = generatedQuiet ? work ? 'work.computer-back' : 'sit.back' : name === 'work.computer-back' && !work ? 'sit.back' : name
  const body = sampleCharacterClip(manifest, bodyName, elapsedMs, progress)
  if (!body) return undefined
  const attachment = body.clip.frames[body.index].mouth
  const rig = manifest.mouth, view = attachment && rig?.views[attachment.view]
  const speechTime = speechElapsedMs ?? (name.startsWith('speak.') ? elapsedMs : undefined)
  const sample = view && sampleCharacterClip(manifest, speechTime == null ? view.closed : view.speaking, speechTime ?? 0)
  return { body, mouth: sample && attachment && rig ? { ...sample, attachment, pivot: rig.pivot } : undefined,
    work: work ? { ...work, parts: work.parts.flatMap(part => {
      const sampled = sampleCharacterClip(manifest, part.clip)
      return sampled ? [{ ...part, ...sampled }] : []
    }) } : undefined }
}

export function characterPreviewTimeline(manifest: CharacterManifest, name: string) {
  const layers = sampleCharacterLayers(manifest, name)
  if (name === 'work.quiet-back' && !manifest.clips[name] && manifest.work) return { loop: true, fallback: false,
    frames: [...Array.from({ length: 12 }, () => ({ durationMs: 250 })), { durationMs: QUIET_WORK_CYCLE_MS - 3000 }] }
  if (name === 'work.computer-back' && manifest.work) return { loop: true, fallback: false, frames: Array.from({ length: WORK_CYCLE_MS / 80 }, () => ({ durationMs: 80 })) }
  return name.startsWith('speak.') && layers?.mouth ? layers.mouth.clip : layers?.body.clip
}
