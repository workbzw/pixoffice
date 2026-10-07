import assert from 'node:assert/strict'
import { mkdtemp, writeFile, cp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = fileURLToPath(new URL('..', import.meta.url))
const temp = await mkdtemp(path.join(tmpdir(), 'pixoffice-packages-'))
const isolated = await mkdtemp(path.join(tmpdir(), 'pixoffice-isolated-'))
const classroom = await mkdtemp(path.join(tmpdir(), 'pixoffice-classroom-packages-'))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const run = (command, args, cwd) => execFileSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
try {
  const dependencies = { 'pixi.js': '^8.18.1' }
  for (const name of ['contracts', 'runtime', 'renderer-pixi', 'animation-frame', 'scene-office', 'assets-office', 'scene-classroom', 'assets-classroom']) {
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
  const generic = Object.fromEntries(Object.entries(dependencies).filter(([name]) => !/^@pixoffice\/(scene-|assets-)/.test(name))
    .map(([name, version]) => [name, version.startsWith('file:') ? `file:${path.join(temp, version.slice(5))}` : version]))
  await writeFile(path.join(isolated, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: generic }))
  console.log(run(npm, ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], isolated).trim())
  for (const ext of ['mjs', 'ts']) await cp(path.join(root, `tests/fixtures/isolated-consumer.${ext}`), path.join(isolated, `consumer.${ext}`))
  await cp(path.join(temp, 'tsconfig.json'), path.join(isolated, 'tsconfig.json'))
  console.log(run(process.execPath, ['consumer.mjs'], isolated).trim())
  run(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', path.join(isolated, 'tsconfig.json')], isolated)
  const classroomDependencies = { ...generic }
  for (const name of ['scene-classroom', 'assets-classroom']) classroomDependencies[`@pixoffice/${name}`] = `file:${path.join(temp, dependencies[`@pixoffice/${name}`].slice(5))}`
  await writeFile(path.join(classroom, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: classroomDependencies }))
  console.log(run(npm, ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], classroom).trim())
  for (const ext of ['mjs', 'ts']) await cp(path.join(root, `tests/fixtures/classroom-consumer.${ext}`), path.join(classroom, `consumer.${ext}`))
  await cp(path.join(temp, 'tsconfig.json'), path.join(classroom, 'tsconfig.json'))
  console.log(run(process.execPath, ['consumer.mjs'], classroom).trim())
  run(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', path.join(classroom, 'tsconfig.json')], classroom)
} catch (error) {
  console.error(error.stdout?.toString() ?? '', error.stderr?.toString() ?? '')
  throw error
} finally { await rm(temp, { recursive: true, force: true }); await rm(isolated, { recursive: true, force: true }); await rm(classroom, { recursive: true, force: true }) }
