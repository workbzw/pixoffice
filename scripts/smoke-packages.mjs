import assert from 'node:assert/strict'
import { mkdtemp, writeFile, cp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = fileURLToPath(new URL('..', import.meta.url))
const temp = await mkdtemp(path.join(tmpdir(), 'pixoffice-packages-'))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const run = (command, args, cwd) => execFileSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
try {
  const dependencies = { 'pixi.js': '^8.18.1' }
  for (const name of ['contracts', 'runtime', 'renderer-pixi', 'animation-frame', 'scene-office']) {
    const [result] = JSON.parse(run(npm, ['pack', '--json', '--ignore-scripts', '--pack-destination', temp], path.join(root, 'packages', name)))
    assert(result.files.some(file => file.path.endsWith('.d.ts')), `${name}: missing declarations`)
    assert(!result.files.some(file => file.path.startsWith('src/')), `${name}: raw source leaked`)
    dependencies[`@pixoffice/${name}`] = `file:./${result.filename}`
  }
  await writeFile(path.join(temp, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies }))
  console.log(run(npm, ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], temp).trim())
  await cp(path.join(root, 'tests/fixtures/package-consumer.mjs'), path.join(temp, 'consumer.mjs'))
  await cp(path.join(root, 'tests/fixtures/package-consumer.ts'), path.join(temp, 'consumer.ts'))
  await writeFile(path.join(temp, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2023', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2023', 'DOM'],
    strict: true, noEmit: true, skipLibCheck: true, types: [],
  }, include: ['consumer.ts'] }))
  console.log(run(process.execPath, ['consumer.mjs'], temp).trim())
  run(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', path.join(temp, 'tsconfig.json')], temp)
  console.log('Packed packages installed outside the workspace; ESM, types and headless office commands passed.')
} catch (error) {
  console.error(error.stdout?.toString() ?? '', error.stderr?.toString() ?? '')
  throw error
} finally { await rm(temp, { recursive: true, force: true }) }
