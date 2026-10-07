import { cp, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { exportAssetPack } from './assets/export-pack.mjs'
const root = fileURLToPath(new URL('..', import.meta.url))
const target = process.argv[2]
if (!target) throw new Error('Usage: npm run assets:export -- /absolute/path/to/new-public-directory')
const out = path.resolve(target)
const catalog = JSON.parse(await readFile(path.join(root, 'public/asset-packs/office-complete.json'), 'utf8'))
await exportAssetPack({ root: path.join(root, 'public'), catalog, output: out })
await cp(path.join(root, 'LICENSE'), path.join(out, 'LICENSE'))
const registry = await readFile(path.join(root, 'public/characters/registry.json'))
await writeFile(path.join(out, 'pixoffice-assets.json'), JSON.stringify({ schemaVersion: 1, pack: 'pixoffice.office', registrySha256: createHash('sha256').update(registry).digest('hex'), characters: 'characters/registry.json', visuals: 'characters/visuals/', furniture: 'assets/office/' }, null, 2) + '\n')
console.log(`Office resources exported to ${out}; existing directories are never overwritten.`)
