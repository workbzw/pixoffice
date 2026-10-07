import { readdir, readFile, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const pending = new Map()
for (const name of await readdir(path.join(root, 'packages'))) {
  const directory = path.join(root, 'packages', name)
  const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'))
  pending.set(manifest.name, { directory, manifest })
}
while (pending.size) {
  const ready = [...pending].find(([, { manifest }]) => !Object.keys(manifest.dependencies ?? {}).some(name => pending.has(name)))
  if (!ready) throw new Error('Circular package dependency')
  const [name, { directory }] = ready
  console.log(`Building ${name}`)
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', path.join(directory, 'tsconfig.json')], { cwd: root, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
  // Remove retired modules after emission, without temporarily breaking live dev imports.
  const expected = new Set((await readdir(path.join(directory, 'src'), { recursive: true })).filter(file => /\.tsx?$/.test(file))
    .flatMap(file => ['.js', '.js.map', '.d.ts'].map(extension => file.replace(/\.tsx?$/, extension))))
  for (const file of await readdir(path.join(directory, 'dist'), { recursive: true })) {
    if (/\.(js|d\.ts)(\.map)?$/.test(file) && !expected.has(file)) await rm(path.join(directory, 'dist', file))
  }
  pending.delete(name)
}
