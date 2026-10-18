import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = fileURLToPath(new URL('../..', import.meta.url))
const cli = path.join(root, 'node_modules/@playwright/test/cli.js')
const ownedImage = !process.env.PIXOFFICE_E2E_IMAGE
const image = process.env.PIXOFFICE_E2E_IMAGE || `pixoffice:integration-e2e-${process.pid}`
const staticContainerName = `pixoffice-e2e-static-${process.pid}`
let activeChild, built = false, staticRoot, staticContainer = false
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { process.exitCode = 1; activeChild?.kill(signal) })
function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit' })
    activeChild = child
    child.once('error', reject)
    child.once('exit', (code, signal) => { activeChild = undefined; code === 0 ? resolve() : reject(new Error(`${command} exited with ${signal ?? code}`)) })
  })
}
try {
  await run(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tests/integration-e2e/tsconfig.json'])
  await run('docker', ['info', '--format', '{{.ServerVersion}}'])
  if (!process.env.PIXOFFICE_E2E_BROWSER_CHANNEL) await run(process.execPath, [cli, 'install', 'chromium'])
  if (ownedImage) {
    const args = ['build', '--tag', image]
    if (process.env.PIXOFFICE_E2E_NODE_IMAGE) args.push('--build-arg', `NODE_IMAGE=${process.env.PIXOFFICE_E2E_NODE_IMAGE}`)
    await run('docker', [...args, '.'])
    built = true
  }
  staticRoot = await mkdtemp(path.join(tmpdir(), 'pixoffice-e2e-static-'))
  await run('docker', ['create', '--name', staticContainerName, image])
  staticContainer = true
  await run('docker', ['cp', `${staticContainerName}:/app/dist/.`, staticRoot])
  await run('docker', ['rm', staticContainerName])
  staticContainer = false
  await run(process.execPath, [cli, 'test', '--config', 'tests/integration-e2e/playwright.config.ts', ...process.argv.slice(2)],
    { ...process.env, PIXOFFICE_E2E_IMAGE: image, PIXOFFICE_E2E_STATIC_ROOT: staticRoot })
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  if (staticContainer) await run('docker', ['rm', '--force', staticContainerName]).catch(() => {})
  if (staticRoot) await rm(staticRoot, { recursive: true, force: true })
  if (built) await run('docker', ['image', 'rm', image]).catch(() => {})
}
