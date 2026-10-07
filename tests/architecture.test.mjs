import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import ts from 'typescript'
import { createTestServer } from './helpers/vite.mjs'

const root = fileURLToPath(new URL('../packages/', import.meta.url))
async function dependencies(entry) {
  const visited = new Set(), imports = new Set()
  async function visit(file) {
    if (visited.has(file)) return
    visited.add(file)
    const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true)
    const specs = []
    function walk(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) specs.push(node.moduleSpecifier.text)
      ts.forEachChild(node, walk)
    }
    walk(source)
    for (const spec of specs) {
      if (!spec.startsWith('.') && !spec.startsWith('@pixoffice/')) { imports.add(spec); continue }
      let base = path.resolve(path.dirname(file), spec)
      if (spec.startsWith('@pixoffice/')) {
        const [name, ...parts] = spec.slice('@pixoffice/'.length).split('/')
        const pkg = JSON.parse(await readFile(path.join(root, name, 'package.json'), 'utf8'))
        const entry = pkg.exports[parts.length ? `./${parts.join('/')}` : '.']
        assert(entry, `Unexported import ${spec}`)
        base = path.join(root, name, entry.import.replace('./dist/', 'src/').replace(/\.js$/, '.ts'))
      }
      let target
      for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
        if (await stat(candidate).then(s => s.isFile()).catch(() => false)) { target = candidate; break }
      }
      assert(target, `Unresolved import ${spec} from ${file}`)
      await visit(target)
    }
  }
  await visit(path.join(root, entry))
  return { files: [...visited].map(file => path.relative(root, file)), imports: [...imports] }
}

test('headless core cannot import office definitions, Pixi, React, application or texture code', async () => {
  const graph = await dependencies('runtime/src/index.ts')
  assert(graph.files.every(file => file.startsWith('runtime/')), graph.files.join('\n'))
  assert.deepEqual(graph.imports.sort(), ['pathfinding', 'zod'])
})
test('generic rendering and presentation do not import concrete scenes or frame players', async () => {
  const graph = await dependencies('renderer-pixi/src/index.ts')
  assert(!graph.files.some(file => /^(scene-office|assets-office|scene-classroom|assets-classroom|animation-frame)\//.test(file)), graph.files.join('\n'))
  assert(!graph.imports.some(id => id.startsWith('react')))
})

test('classroom and office are peer scenes; classroom core is headless and assets cannot pull in scene rules', async () => {
  const core = await dependencies('scene-classroom/src/core/index.ts')
  assert(!core.imports.some(id => /^(pixi|react)/.test(id)))
  const presentation = await dependencies('scene-classroom/src/pixi/index.ts')
  assert(!presentation.files.some(file => /^(scene-office|assets-office|animation-frame|assets-classroom)\//.test(file)))
  const assets = await dependencies('assets-classroom/src/index.ts')
  assert(!assets.files.some(file => /^(scene-|assets-office|runtime|renderer-pixi)/.test(file)))
  const office = await dependencies('scene-office/src/core/index.ts')
  assert(!office.files.some(file => /classroom/.test(file)))
})
test('office core is headless and the frame adapter has no office or UI imports', async () => {
  const office = await dependencies('scene-office/src/core/index.ts')
  assert(!office.imports.includes('pixi.js'))
  assert(!office.files.some(file => /^(renderer-pixi|animation-frame)\//.test(file)))
  const frame = await dependencies('animation-frame/src/FrameAdapter.ts')
  assert(!frame.files.some(file => /^(scene-office|assets-office|renderer-pixi|runtime)\//.test(file)), frame.files.join('\n'))
})

test('an independent scene runs without an office roster, fixed workstation or renderer', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { createSceneRuntime, scenePrimitives } = await server.ssrLoadModule('/packages/runtime/src/index.ts')
  const actor = { id: 'visitor', name: 'Visitor', templateId: 'custom-look', color: 0, position: { x: 1, y: 1 }, facing: 'front', posture: 'standing', presentation: { status: 'idle', title: '', sourceRevision: 0 } }
  const pack = { manifest: { id: 'test.open-floor', version: '1', apiVersion: 1 }, plugins: [scenePrimitives], createWorld(sceneId = 'test-room') {
    return { sceneId, unit: 'cell', width: 8, height: 8, gridSize: 1, layoutRevision: 0, bounds: { left: 0, top: 0, right: 8, bottom: 8 }, actors: [actor], props: [] }
  } }
  const runtime = createSceneRuntime(pack); t.after(() => runtime.dispose())
  assert.equal(runtime.readActors().length, 1)
  assert.equal(runtime.readActors()[0].homeId, undefined)
  const result = runtime.submit({ protocolVersion: '2.0', sceneId: 'test-room', commandId: 'say', type: 'activity.start', capability: 'scene.say', participants: [{ entityId: 'visitor', role: 'actor' }], params: { text: 'Hello', durationMs: 300 } })
  assert.equal(result.status, 'running')
  for (let i = 0; i < 20; i++) runtime.tick(50)
  assert.equal(runtime.getRecord('say').status, 'completed')
  assert.equal(runtime.readActors()[0].facing, 'front')
  assert.throws(() => createSceneRuntime({ ...pack, manifest: { ...pack.manifest, apiVersion: 99 } }))
})

test('map restoration reads furniture posture, anchor and facing instead of assuming back-facing office seats', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { materializeMap, exportMap } = await server.ssrLoadModule('/packages/runtime/src/map/MapDraft.ts')
  const { restoreInteractionFacing } = await server.ssrLoadModule('/packages/runtime/src/furnitureBinding.ts')
  const template = { id: 'test.port', footprint: { left: 0, top: 0, right: 1, bottom: 1 }, anchors: { seat: { x: 0, y: 1 } },
    interactions: { seat: { anchor: 'seat', facing: 'front', posture: 'standing' } } }
  const world = { sceneId: 'ports', unit: 'cell', width: 8, height: 8, gridSize: 1, layoutRevision: 0, bounds: { left: 0, top: 0, right: 8, bottom: 8 },
    actors: [{ id: 'one', homeId: 'port', name: 'One', position: { x: 1, y: 1 } }],
    props: [{ id: 'port', templateId: template.id, name: 'Port', position: { x: 4, y: 4 }, state: {}, stateRevision: 0 }] }
  const restored = materializeMap(exportMap(world), world, () => template)
  assert.deepEqual(restored.actors[0].position, { x: 4, y: 5 })
  assert.equal(restored.actors[0].posture, 'standing')
  assert.equal(restored.actors[0].facing, 'front')
  restored.actors[0].facing = 'left'; restoreInteractionFacing(restored, restored.actors[0], () => template)
  assert.equal(restored.actors[0].facing, 'front')
})
