import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('.', import.meta.url))
export default defineConfig({
  root, publicDir: fileURLToPath(new URL('../../public', import.meta.url)),
  resolve: { dedupe: ['pixi.js'] }, build: { outDir: 'dist', emptyOutDir: true },
})
