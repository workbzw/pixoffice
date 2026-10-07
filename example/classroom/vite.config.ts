import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)), base: './', publicDir: 'public', plugins: [react(), {
    name: 'classroom-isolation', generateBundle() {
      for (const id of this.getModuleIds()) if (/(?:packages|@pixoffice)[\\/](?:scene-office|assets-office)[\\/]/.test(id)) this.error(`Classroom imported office code: ${id}`)
    },
  }],
  resolve: { dedupe: ['pixi.js', 'react', 'react-dom'] },
  build: { outDir: 'dist', emptyOutDir: true },
})
