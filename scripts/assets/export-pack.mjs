import { readFile, writeFile, mkdir, realpath, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { z } from 'zod'
const relativePath = z.string().refine(value => value.length > 0 && !path.isAbsolute(value) && !value.includes('\\') && value.split('/').every(part => part && part !== '.' && part !== '..'), 'Expected a relative file path')
const schema = z.strictObject({
  schemaVersion: z.literal(1), id: z.string().min(1), revision: z.string().regex(/^[a-f0-9]{64}$/),
  files: z.array(z.strictObject({ path: relativePath, sha256: z.string().regex(/^[a-f0-9]{64}$/) })).min(1),
  entrypoints: z.record(z.string(), relativePath),
})
const sha = value => createHash('sha256').update(value).digest('hex')
async function readInside(root, file) {
  const target = await realpath(path.join(root, file))
  if (!target.startsWith(root + path.sep)) throw new Error(`Asset escapes root: ${file}`)
  return readFile(target)
}
export async function createAssetCatalog(root, id, files, entrypoints = {}) {
  const base = await realpath(root), entries = []
  for (const file of [...new Set(files)].sort()) {
    relativePath.parse(file)
    entries.push({ path: file, sha256: sha(await readInside(base, file)) })
  }
  return schema.parse({ schemaVersion: 1, id, revision: sha(JSON.stringify({ files: entries, entrypoints })), files: entries, entrypoints })
}
export async function exportAssetPack({ root, catalog, output }) {
  const manifest = schema.parse(catalog), base = await realpath(root)
  const names = new Set(manifest.files.map(file => file.path))
  if (names.size !== manifest.files.length || names.has('asset-pack.json')) throw new Error('Duplicate or reserved asset path')
  for (const entry of Object.values(manifest.entrypoints)) if (!names.has(entry)) throw new Error(`Undeclared entrypoint: ${entry}`)
  if (manifest.revision !== sha(JSON.stringify({ files: manifest.files, entrypoints: manifest.entrypoints }))) throw new Error('Catalog revision mismatch')
  const buffers = []
  for (const file of manifest.files) {
    const buffer = await readInside(base, file.path)
    if (sha(buffer) !== file.sha256) throw new Error(`Asset hash mismatch: ${file.path}`)
    buffers.push(buffer)
  }
  // All validation precedes creating a new destination; existing directories are never touched.
  await mkdir(output, { recursive: false })
  try {
    for (let i = 0; i < manifest.files.length; i++) {
      const target = path.join(output, manifest.files[i].path)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, buffers[i], { flag: 'wx' })
    }
    await writeFile(path.join(output, 'asset-pack.json'), JSON.stringify(manifest, null, 2) + '\n')
  } catch (error) { await rm(output, { recursive: true, force: true }); throw error }
  return manifest
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [catalogPath, output, root = fileURLToPath(new URL('../../public', import.meta.url))] = process.argv.slice(2)
  if (!catalogPath || !output) throw new Error('Usage: assets:export:pack -- catalog.json NEW_DIRECTORY [ASSET_ROOT]')
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
  await exportAssetPack({ root, catalog, output: path.resolve(output) })
  console.log(`Exported ${catalog.id}: ${catalog.files.length} verified files`)
}
