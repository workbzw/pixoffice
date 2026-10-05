import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { bindOfficeFrames } from '../assets/office/frameBindings.ts'
import { CharacterManifestSchema } from '@pixoffice/animation-frame/packSchema'
const root = fileURLToPath(new URL('../public/characters/', import.meta.url))
const registry = JSON.parse(await readFile(path.join(root, 'registry.json'), 'utf8'))
await mkdir(path.join(root, 'visuals'), { recursive: true })
for (const entry of registry.characters) {
  const source = CharacterManifestSchema.parse(JSON.parse(await readFile(path.join(root, entry.manifest), 'utf8')))
  await writeFile(path.join(root, 'visuals', `${entry.id}.json`), JSON.stringify(bindOfficeFrames(source, `../${entry.manifest}`), null, 2) + '\n')
}
console.log(`Visual manifests built: ${registry.characters.length}`)
