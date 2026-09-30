import { spawn } from 'node:child_process'

const children = []

function start(name, command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: true,
    ...options,
  })
  children.push(child)

  child.on('exit', (code, signal) => {
    if (signal) return
    if (code && code !== 0) {
      console.error(`[dev] ${name} exited with code ${code}`)
      shutdown(code)
    }
  })

  return child
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

start('action-gateway', process.execPath, ['scripts/action-gateway.mjs'], {
  shell: false,
})
start('vite', 'vite', [])
