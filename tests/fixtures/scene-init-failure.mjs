import { createTestServer } from '../helpers/vite.mjs'
import { Application } from 'pixi.js'

const server = await createTestServer(), unhandled = []
process.on('unhandledRejection', error => unhandled.push(error.message))
globalThis.window = { devicePixelRatio: 1 }
const original = Application.prototype.init
Application.prototype.init = async function () {
  await new Promise((_, reject) => setTimeout(() => reject(new Error('app-init-failed')), 20))
}
try {
  const { SceneView } = await server.ssrLoadModule('/packages/renderer-pixi/src/SceneView.ts')
  const view = new SceneView({ runtime: {}, pack: { cellPixels: 50, createPropViews: () => ({}),
    loadBackground: async () => { throw new Error('background-failed') } } })
  let failure
  try { await view.init({}, 100, 100) } catch (error) { failure = error.message }
  await new Promise(resolve => setImmediate(resolve))
  view.destroy()
  console.log(JSON.stringify({ failure, unhandled, destroyed: view.grid.destroyed && view.overlays.destroyed }))
} finally { Application.prototype.init = original; await server.close() }
