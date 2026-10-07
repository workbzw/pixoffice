import { z } from 'zod'
import { CharacterSourceSchema as BaseSource, CharacterManifestSchema as BaseManifest, validateFrameSource, characterFrameDependencies as frameDependencies, sampleCharacterClip } from '@pixoffice/animation-frame/packSchema'
import { validWorkSurface, type WorkSurface } from '@pixoffice/contracts/contactSurface'
import { sampleComputerWork, sampleQuietWork, QUIET_WORK_CYCLE_MS, WORK_CYCLE_MS } from './workAnimation.ts'
export { CharacterRegistrySchema, resolveCharacterClip, sampleCharacterClip } from '@pixoffice/animation-frame/packSchema'
export type { CharacterRegistry } from '@pixoffice/animation-frame/packSchema'

const { clips: sourceClips, ...common } = BaseSource.shape
const { revision, pages, frames, clips: packedClips } = BaseManifest.shape
const clipName = z.string().regex(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/)
const workPoint = z.object({ x: z.number().finite(), y: z.number().finite() }).strict()
const armPart = z.object({ clip: clipName, root: workPoint, tip: workPoint }).strict()
const workRig = z.object({
  shoulders: z.object({ left: workPoint, right: workPoint }).strict(),
  upper: armPart, forearm: armPart, hand: armPart,
  previewSurface: z.object({ keyboardLeft: workPoint, keyboardRight: workPoint, mouse: workPoint,
    bounds: z.object({ left: z.number().finite(), right: z.number().finite(), back: z.number().finite(), front: z.number().finite() }).strict(),
  }).strict(),
}).strict()

const fields = { ...common, profile: z.enum(['basic', 'office']), work: workRig.optional() }
type ClipGraph = Record<string, { alias: string; mirrorX: boolean } | { frames: { mouth?: unknown }[]; loop: boolean }>
function validateOffice(value: { canvas: { width: number; height: number }; profile: string; clips: ClipGraph; work?: z.infer<typeof workRig> }, ctx: z.RefinementCtx) {
  const problem = (message: string) => ctx.addIssue({ code: 'custom', message })
  const required = ['idle.front', 'idle.back', 'idle.left', 'idle.right', 'walk.front', 'walk.back', 'walk.left', 'walk.right']
  if (value.profile === 'office') required.push('sit.back', 'talk.seated-left', 'talk.seated-right', 'sit-down.back', 'stand-up.back')
  for (const name of required) if (!Object.hasOwn(value.clips, name)) problem(`Missing required clip: ${name}`)
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
export const CharacterSourceSchema = z.strictObject({ ...fields, clips: sourceClips }).superRefine((value, ctx) => { validateFrameSource(value, ctx); validateOffice(value, ctx) })
export const CharacterManifestSchema = z.strictObject({ ...fields, revision, pages, frames, clips: packedClips }).superRefine((value, ctx) => {
  const result = BaseManifest.safeParse(value)
  if (!result.success) for (const issue of result.error.issues) ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message })
  validateOffice(value, ctx)
})
export type CharacterSource = z.infer<typeof CharacterSourceSchema>
export type CharacterManifest = z.infer<typeof CharacterManifestSchema>

export function characterFrameDependencies(manifest: Pick<CharacterManifest, 'clips' | 'mouth' | 'work'>, names: string[]) {
  const expanded = [...names]
  if (manifest.work && names.some(name => name === 'work.computer-back' || name === 'work.quiet-back' && !manifest.clips[name])) {
    expanded.push('work.computer-back', manifest.work.upper.clip, manifest.work.forearm.clip, manifest.work.hand.clip)
  }
  return frameDependencies(manifest, expanded)
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
