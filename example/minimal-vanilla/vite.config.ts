import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { releaseAssetsPlugin } from '../../scripts/assets/release.mjs'
const root = fileURLToPath(new URL('.', import.meta.url))
export default defineConfig({
  root, publicDir: fileURLToPath(new URL('../../public', import.meta.url)),
  plugins: [releaseAssetsPlugin('office')],
  resolve: { dedupe: ['pixi.js'] }, build: { outDir: 'dist', emptyOutDir: true },
})
