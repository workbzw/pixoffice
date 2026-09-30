import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

export function createTestServer(mode = 'queue') {
  return createServer({
    configFile: false,
    root: fileURLToPath(new URL('../..', import.meta.url)),
    resolve: {
      alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) },
    },
    define: { 'import.meta.env.VITE_OFFICE_DISPATCH_MODE': JSON.stringify(mode) },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    appType: 'custom',
  })
}
