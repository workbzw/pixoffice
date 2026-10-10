import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)), base: './', publicDir: 'public', plugins: [react(), {
    name: 'farm-isolation', generateBundle() {
      for (const id of this.getModuleIds()) if (/(?:packages|@pixoffice)[\\/](?:scene-office|assets-office|scene-classroom|assets-classroom)[\\/]/.test(id)) this.error(`Farm imported another scene: ${id}`)
    },
  }], resolve: { dedupe: ['pixi.js', 'react', 'react-dom'] }, build: { outDir: 'dist', emptyOutDir: true },
})
