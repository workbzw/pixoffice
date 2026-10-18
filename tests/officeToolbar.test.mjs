import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTestServer } from './helpers/vite.mjs'

let server, OfficeSceneControls
before(async () => {
  server = await createTestServer()
  ;({ OfficeSceneControls } = await server.ssrLoadModule('/example/office-web/src/ui/OfficeSceneControls.tsx'))
})
after(() => server?.close())

function render(canDemo) {
  return renderToStaticMarkup(createElement(OfficeSceneControls, {
    runtime: { editorSnapshot: () => undefined }, mapView: {}, setMapView() {},
    controller: { sceneRef: { current: null }, menu: null, setMenu() {}, demo: false, setDemo() {}, canDemo,
      setNotice() {}, loaded: true, actions: { ready: true }, thumbnails: {}, previewProp() {}, highlightProp() {} },
  }))
}

test('office toolbar keeps layout/demo controls and removes the character preview entry', () => {
  const demo = render(true)
  assert.match(demo, /aria-label="编辑布局"/)
  assert.match(demo, /aria-label="开始演示"/)
  assert(!demo.includes('人物预览'))
  assert(!demo.includes('character-preview-trigger'))
  const real = render(false)
  assert.match(real, /aria-label="编辑布局"/)
  assert(!real.includes('开始演示'))
})

test('office toolbar is anchored to the top-right of the scene', async () => {
  const css = await readFile(new URL('../example/office-web/src/components/OfficeCanvas.css', import.meta.url), 'utf8')
  const rule = css.match(/\.runtime-scene-toolbar\s*\{([^}]+)\}/)[1]
  assert.match(rule, /right:\s*12px/)
  assert.match(rule, /top:\s*12px/)
  assert(!/\bleft\s*:/.test(rule))
})
