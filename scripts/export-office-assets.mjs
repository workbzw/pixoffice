import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createHash } from 'node:crypto'
const root = fileURLToPath(new URL('..', import.meta.url))
const target = process.argv[2]
if (!target) throw new Error('Usage: npm run assets:export -- /absolute/path/to/new-public-directory')
const out = path.resolve(target)
await mkdir(out, { recursive: false })
for (const relative of ['characters', 'assets/office']) await cp(path.join(root, 'public', relative), path.join(out, relative), { recursive: true })
await cp(path.join(root, 'LICENSE'), path.join(out, 'LICENSE'))
const registry = await readFile(path.join(root, 'public/characters/registry.json'))
await writeFile(path.join(out, 'pixoffice-assets.json'), JSON.stringify({ schemaVersion: 1, pack: 'pixoffice.office', registrySha256: createHash('sha256').update(registry).digest('hex'), characters: 'characters/registry.json', visuals: 'characters/visuals/', furniture: 'assets/office/' }, null, 2) + '\n')
console.log(`Office resources exported to ${out}; existing directories are never overwritten.`)
