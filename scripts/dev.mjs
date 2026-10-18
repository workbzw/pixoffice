import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createDevEnvironment } from './dev-config.mjs'

const children = []
let stopping = false
const environment = createDevEnvironment(process.env)

function start(name, command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: false,
    ...options,
  })
  children.push(child)

  child.once('error', error => {
    console.error(`[dev] ${name} failed to start`, error)
    shutdown(1)
  })
  child.once('exit', (code, signal) => {
    if (stopping) return
    console.error(`[dev] ${name} exited unexpectedly (${signal ?? code})`)
    shutdown(code || 1)
  })

  return child
}

function shutdown(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

start('pixoffice-server', process.execPath, ['server/dist/index.js'], { env: environment.server })
start('vite', process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), ...process.argv.slice(2)], { env: environment.vite })
