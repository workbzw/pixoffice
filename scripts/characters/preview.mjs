import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { buildCharacter } from './build.mjs'
import { readQualityInputs } from './quality.mjs'

export async function prepareCharacterPreview(directory, { outputRoot = path.resolve(import.meta.dirname, '../../.character-preview') } = {}) {
  const built = await buildCharacter(directory)
  const { digest } = await readQualityInputs(directory)
  const destination = path.join(outputRoot, digest, built.source.id)
  await mkdir(destination, { recursive: true })
  for (const [file, bytes] of built.outputs) await writeFile(path.join(destination, file), bytes)
  const registry = { schemaVersion: 1, characters: [{ id: built.source.id, label: built.source.label,
    manifest: `${built.source.id}/${built.manifestFile}`, clips: Object.keys(built.source.clips) }] }
  await writeFile(path.join(outputRoot, digest, 'registry.json'), JSON.stringify(registry, null, 2) + '\n')
  return { id: built.source.id, digest, previewPath: `/character-lab.html?candidate=${digest}`, status: 'preview-only' }
}
