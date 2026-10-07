import assert from 'node:assert/strict'
import { readFile, readdir, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('..', import.meta.url))
const allowed = {
  contracts: [], runtime: [],
  'renderer-pixi': ['contracts', 'runtime'],
  'animation-frame': ['contracts'],
  'assets-office': ['contracts', 'animation-frame'],
  'scene-office': ['contracts', 'runtime', 'renderer-pixi'],
  'scene-classroom': ['contracts', 'runtime', 'renderer-pixi'],
  'assets-classroom': ['contracts', 'animation-frame'],
}
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  return (await Promise.all(entries.map(e => e.isDirectory() ? files(path.join(dir, e.name)) : path.join(dir, e.name)))).flat()
}
const manifests = new Map()
const actual = (await readdir(path.join(root, 'packages'), { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
assert.deepEqual(actual, Object.keys(allowed).sort(), 'Every package needs an explicit boundary policy')
for (const name of Object.keys(allowed)) {
  manifests.set(name, JSON.parse(await readFile(path.join(root, 'packages', name, 'package.json'), 'utf8')))
}
for (const [name, pkg] of manifests) {
  const dir = path.join(root, 'packages', name)
  const declared = { ...pkg.dependencies, ...pkg.peerDependencies }
  for (const [key, value] of Object.entries(pkg.exports)) {
    assert(!key.includes('*'), `${name}: exports must be explicit`)
    await access(path.join(dir, value.import))
    await access(path.join(dir, value.types))
  }
  for (const file of (await files(path.join(dir, 'src'))).filter(file => /\.tsx?$/.test(file))) {
    const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true)
    const specs = []
    function visit(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) specs.push(node.moduleSpecifier.text)
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) specs.push(node.argument.literal.text)
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) specs.push(node.arguments[0].text)
      ts.forEachChild(node, visit)
    }
    visit(source)
    for (const spec of specs) {
      assert(!spec.startsWith('@/'), `${file}: application alias ${spec}`)
      if (spec.startsWith('.')) {
        const target = path.resolve(path.dirname(file), spec)
        assert(target.startsWith(`${dir}/src/`), `${file}: cross-package relative import ${spec}`)
        await access(target)
        continue
      }
      const dependency = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
      assert(declared[dependency], `${file}: undeclared dependency ${dependency}`)
      if (dependency.startsWith('@pixoffice/')) {
        const target = dependency.slice('@pixoffice/'.length)
        assert(allowed[name].includes(target), `${name} must not depend on ${target}`)
        assert(manifests.get(target).exports[spec.slice(dependency.length) ? `.${spec.slice(dependency.length)}` : '.'], `${file}: private entry ${spec}`)
      }
      if (name === 'contracts' || name === 'runtime') assert(!/^(react|pixi)/.test(dependency), `${name} must remain headless`)
    }
  }
  if (pkg.peerDependencies?.['pixi.js']) assert(!pkg.dependencies?.['pixi.js'], `${name}: Pixi must be shared by the host`)
}
console.log(`Package boundaries, declarations and explicit exports verified (${manifests.size} packages).`)
