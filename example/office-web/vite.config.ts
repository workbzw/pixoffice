import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { releaseAssetsPlugin } from '../../scripts/assets/release.mjs'

const root = fileURLToPath(new URL('.', import.meta.url))
const relayUrl = process.env.PIXOFFICE_INTERNAL_API_URL
export default defineConfig({
  root,
  envDir: path.resolve(root, '../..'),
  publicDir: path.resolve(root, '../../public'),
  plugins: [react(), releaseAssetsPlugin(), {
    name: 'character-candidate-preview',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (/^\/\.character-preview\/[a-f0-9]{64}\/[a-zA-Z0-9_./-]+(?:\?.*)?$/.test(req.url ?? '') && !req.url!.includes('..')) {
          req.url = `/@fs${path.resolve(root, '../..')}${req.url}`
        }
        next()
      })
    },
  }],
  resolve: { dedupe: ['pixi.js', 'react', 'react-dom'] },
  server: {
    fs: { allow: [path.resolve(root, '../..')] },
    proxy: relayUrl ? {
      '/api/pixoffice': { target: relayUrl },
      '/pixoffice-config.js': { target: relayUrl },
    } : undefined,
  },
  build: {
    outDir: path.resolve(root, '../../dist'), emptyOutDir: true,
    rolldownOptions: {
      input: {
        website: path.resolve(root, 'index.html'),
        office: path.resolve(root, 'office/index.html'),
        minimal: path.resolve(root, 'minimal/index.html'),
        classroom: path.resolve(root, 'classroom/index.html'),
        farm: path.resolve(root, 'farm/index.html'),
        civic: path.resolve(root, 'civic/index.html'),
      },
    },
  },
})
