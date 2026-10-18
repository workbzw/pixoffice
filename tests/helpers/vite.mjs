import { fileURLToPath } from 'node:url'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { createServer } from 'vite'

export async function createTestServer() {
  const root = fileURLToPath(new URL('../..', import.meta.url))
  const alias = []
  for (const entry of await readdir(path.join(root, 'packages'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const directory = path.join(root, 'packages', entry.name)
    const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'))
    for (const [key, entry] of Object.entries(manifest.exports)) {
      const spec = manifest.name + (key === '.' ? '' : key.slice(1))
      alias.push({ find: new RegExp(`^${spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), replacement: path.join(directory, entry.import.replace('./dist/', 'src/').replace(/\.js$/, '.ts')) })
    }
  }
  return createServer({
    configFile: false,
    root: fileURLToPath(new URL('../..', import.meta.url)),
    resolve: {
      alias,
    },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    appType: 'custom',
  })
}
