import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { createTestServer } from './helpers/vite.mjs'

let server
before(async () => { server = await createTestServer() })
after(async () => { await server?.close() })

class Element {
  style = {}
  dataset = {}
  children = []
  parentElement = null
  appendChild(child) {
    child.remove()
    this.children.push(child); child.parentElement = this
  }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this)
    this.parentElement = null
  }
}

test('changing a scene host container preserves the renderer DOM and ignores stale detach callbacks', async t => {
  const original = globalThis.document
  globalThis.document = { createElement: () => new Element() }
  t.after(() => { if (original === undefined) delete globalThis.document; else globalThis.document = original })
  const { SceneHost } = await server.ssrLoadModule('/example/shared/scene/SceneHost.ts')
  const host = new SceneHost(), full = new Element(), standalone = new Element(), canvas = new Element()
  host.element.appendChild(canvas)
  const detachFull = host.attach(full)
  const root = host.element
  const detachStandalone = host.attach(standalone)
  detachFull()
  assert.equal(host.element, root)
  assert.deepEqual(full.children, [])
  assert.equal(standalone.children[0], root)
  assert.equal(root.children[0], canvas)
  const detachAgain = host.attach(standalone)
  detachStandalone()
  assert.equal(root.parentElement, standalone)
  detachAgain()
  assert.equal(root.parentElement, null)
  assert.equal(root.children[0], canvas)
  assert.notEqual(new SceneHost().element, root)
})

test('application shells cannot construct renderers, load scene assemblies or import scene controllers at runtime', async () => {
  const files = [
    'example/office-web/src/ui/OfficeShell.tsx',
    'example/classroom/src/ui/ClassroomShell.tsx',
    'example/farm/src/ui/FarmShell.tsx',
    'example/dimetric/src/studio/ui/StudioShell.tsx',
  ]
  for (const file of files) {
    const text = await readFile(new URL(`../${file}`, import.meta.url), 'utf8')
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    function inspect(node) {
      if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) {
        const spec = node.moduleSpecifier.text
        assert(!/pixi|renderer|\/controller\/|\/assembly|\/engine|\/scene\//.test(spec.replace('/shared/scene/layout.tsx', '/shared/layout.tsx')), `${file}: ${spec}`)
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        assert(!['mountScene', 'createSceneRuntime', 'createOfficeRuntime', 'mountStudioView'].includes(node.expression.text), file)
      }
      ts.forEachChild(node, inspect)
    }
    inspect(source)
  }
})
