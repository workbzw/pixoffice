import { fileURLToPath } from 'node:url'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { createServer } from 'vite'

export async function createTestServer(mode = 'queue') {
  const root = fileURLToPath(new URL('../..', import.meta.url))
  const alias = []
  for (const name of await readdir(path.join(root, 'packages'))) {
    const directory = path.join(root, 'packages', name)
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
    define: { 'import.meta.env.VITE_OFFICE_DISPATCH_MODE': JSON.stringify(mode) },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    appType: 'custom',
  })
}
