import { watch } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
let child, timer, dirty = false, closing = false
function build() {
  if (child) { dirty = true; return }
  dirty = false
  child = spawn(process.execPath, ['scripts/build-packages.mjs'], { cwd: root, stdio: 'inherit' })
  child.on('exit', code => {
    child = undefined
    if (code && !closing) console.error('Package build failed; waiting for the next edit.')
    if (dirty && !closing) build()
  })
}
const watchers = []
for (const name of await readdir(path.join(root, 'packages'))) {
  watchers.push(watch(path.join(root, 'packages', name), { recursive: true }, (_event, filename) => {
    if (!filename || !/^(src\/|package\.json$|tsconfig\.json$)/.test(String(filename))) return
    clearTimeout(timer)
    timer = setTimeout(build, 150)
  }))
}
function close() { closing = true; clearTimeout(timer); watchers.forEach(w => w.close()); child?.kill('SIGTERM') }
process.on('SIGINT', close)
process.on('SIGTERM', close)
console.log('Watching package sources; Vite consumes their compiled exports.')
