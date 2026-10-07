import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  publicDir: 'public',
  resolve: { dedupe: ['pixi.js'] },
  plugins: [{ name: 'reject-office-dependencies', generateBundle() {
    for (const id of this.getModuleIds()) {
      if (/[\\/]packages[\\/](scene-office|assets-office)[\\/]/.test(id) || /[\\/]@pixoffice[\\/](scene-office|assets-office)[\\/]/.test(id)) {
        this.error(`Independent scene must not import office code: ${id}`)
      }
    }
  } }],
  build: { outDir: 'dist', emptyOutDir: true },
})
