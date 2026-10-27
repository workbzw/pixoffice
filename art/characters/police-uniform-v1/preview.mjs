import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildCharacter } from '../../../scripts/characters/build.mjs'
import { inspectCharacterQuality } from '../../../scripts/characters/quality.mjs'

// Explicitly unvalidated art preview. Never writes the production registry or review approvals.
const root = path.resolve(import.meta.dirname, '../../..')
const ids = ['office-lead', 'code-agent', 'file-agent', 'app-agent', 'review-agent', 'data-agent']
export async function buildCivicPreview(source, destination) {
  const reports = []
  for (const id of ids) reports.push(await inspectCharacterQuality(path.join(source, id)))
  const digest = createHash('sha256').update(JSON.stringify(reports.map(report => report.digest))).digest('hex')
  const output = destination ?? path.join(root, '.character-preview', digest, 'characters')
  const temp = await mkdtemp(path.join(tmpdir(), 'pixoffice-civic-art-preview-'))
  try {
    const characters = []
    for (const id of ids) {
      const directory = path.join(temp, id)
      const definition = JSON.parse(await readFile(path.join(source, id, 'character.json'), 'utf8'))
      await mkdir(directory, { recursive: true })
      await writeFile(path.join(directory, 'character.json'), JSON.stringify(definition))
      for (const file of new Set(Object.values(definition.clips).flatMap(clip => clip.frames?.map(frame => frame.file) ?? []))) {
        await mkdir(path.dirname(path.join(directory, file)), { recursive: true })
        await cp(path.join(source, id, file), path.join(directory, file))
      }
      // Packing the raw candidate lets its defects be inspected; no admission result is claimed.
      const built = await buildCharacter(directory)
      await mkdir(path.join(output, id), { recursive: true })
      for (const [file, bytes] of built.outputs) await writeFile(path.join(output, id, file), bytes)
      characters.push({ id, label: built.source.label, manifest: `${id}/${built.manifestFile}`, clips: Object.keys(definition.clips), portrait: built.portrait })
    }
    await writeFile(path.join(output, 'registry.json'), JSON.stringify({ schemaVersion: 1, characters }, null, 2) + '\n')
    await writeFile(path.join(output, '../audit.json'), JSON.stringify({ status: 'preview-only', reports }, null, 2) + '\n')
    return { status: 'preview-only', url: `/civic/?candidate=${digest}`, output }
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const source = path.resolve(root, process.env.POLICE_STAGING_ROOT ?? '.character-staging/civic-seating-v10-final')
  console.log(JSON.stringify(await buildCivicPreview(source), null, 2))
}
