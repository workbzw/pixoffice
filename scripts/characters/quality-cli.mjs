import { mkdir, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectCharacterQuality, readQualityInputs, resolveSourceClip, sha256, VISUAL_CHECKS } from './quality.mjs'
import { publishCharacterCandidate } from './publish.mjs'
import { prepareCharacterPreview } from './preview.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const encode = value => JSON.stringify(value, null, 2) + '\n'

export async function createQualityDraft(directory) {
  const target = await realpath(directory), active = await realpath(path.join(root, 'art/characters/packs'))
  if (target === active || target.startsWith(active + path.sep)) throw new Error('Create drafts in a staging directory, not the active library')
  const { source, buffers } = await readQualityInputs(directory)
  const references = Object.fromEntries(['front', 'right', 'back'].map(view => [view, resolveSourceClip(source, `idle.${view}`).clip.frames[0].file]))
  const actions = {}
  for (const [name, clip] of Object.entries(source.clips)) {
    if ('alias' in clip) continue
    const template = /^(mouth|part)\./.test(name) ? 'part' : name.startsWith('work.') ? 'work' : /^(walk|run)\./.test(name) ? 'walk'
      : /^(stand-up|sit-down)\./.test(name) ? 'transition' : /^(idle|sit|talk\.seated-)\b/.test(name) ? 'still' : name.startsWith('speak.') ? 'speech' : 'gesture'
    actions[name] = { template, reference: clip.frames[0].file, changes: [] }
    if (template === 'walk') actions[name].phases = ['left-contact', 'left-pass', 'right-contact', 'right-pass']
    if (['walk', 'transition', 'gesture'].includes(template)) actions[name].continuity = { maxHeadStepPx: 4, maxHeadAreaStepRatio: .035, maxSilhouetteChangeRatio: .35 }
  }
  const draft = { schemaVersion: 1, references, referenceHashes: Object.fromEntries(Object.entries(references).map(([view, file]) => [view, sha256(buffers.get(file))])), registrations: {}, actions }
  await writeFile(path.join(directory, 'quality.json'), encode(draft), { flag: 'wx' })
  return draft
}

export async function main(args) {
  const [command, ...options] = args
  const values = {}
  for (let i = 0; i < options.length; i += 2) {
    if (!['--pack', '--report'].includes(options[i]) || !options[i + 1] || options[i + 1].startsWith('--')) throw new Error('Usage: quality-cli.mjs draft|audit|preview|review-template|publish --pack <directory> [--report <json>]')
    values[options[i]] = options[i + 1]
  }
  if (!values['--pack']) throw new Error('--pack is required')
  const directory = path.resolve(values['--pack'])
  if (command === 'draft') {
    await createQualityDraft(directory)
    console.log('Draft created. Fill real registration records and changing regions; this is NOT approval.')
    return 0
  }
  if (command === 'publish') { console.log(encode(await publishCharacterCandidate(directory))); return 0 }
  if (command === 'preview') { console.log(encode(await prepareCharacterPreview(directory))); return 0 }
  if (!['audit', 'review-template'].includes(command)) throw new Error('Unknown quality command')
  const report = await inspectCharacterQuality(directory)
  if (values['--report']) {
    const file = path.resolve(values['--report'])
    // Reports cannot overwrite source contracts or previously saved evidence.
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, encode(report), { flag: 'wx' })
  }
  if (command === 'review-template' && report.passed) {
    await writeFile(path.join(directory, 'review.pending.json'), encode({
      schemaVersion: 1, digest: report.digest, reviewer: '', reviewedAt: '',
      checks: Object.fromEntries(VISUAL_CHECKS.map(name => [name, false])), evidence: [], notes: '',
    }), { flag: 'wx' })
    console.log('review.pending.json created. Perform the visual checks before completing and renaming it to review.json.')
  }
  console.log(encode(report))
  return report.passed ? 0 : 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await main(process.argv.slice(2)) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
