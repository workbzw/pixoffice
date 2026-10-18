import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export function isClassicProductModule(id: string): boolean {
  return /(?:packages|@pixoffice)[\\/](?:scene|assets)-(?:office|classroom|farm)(?:[\\/]|$)/.test(id)
    || /example[\\/](?:office-web|classroom|farm|minimal-vanilla|isolated-scene)[\\/]/.test(id)
}

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)), base: './', publicDir: 'public',
  plugins: [react(), {
    name: 'dimetric-product-isolation', generateBundle() {
      for (const id of this.getModuleIds()) if (isClassicProductModule(id)) {
        this.error(`Dimetric validation must not import classic scenes or assets: ${id}`)
      }
    },
  }],
  resolve: { dedupe: ['pixi.js', 'react', 'react-dom'] }, build: { outDir: 'dist', emptyOutDir: true },
})
