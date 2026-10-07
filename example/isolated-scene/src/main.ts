import { mountScene } from '@pixoffice/renderer-pixi'
import './style.css'
const status = document.querySelector<HTMLOutputElement>('#status')!
const controls = [...document.querySelectorAll<HTMLButtonElement>('button')]
const abort = new AbortController()
let cleanup: (() => void) | undefined
void mountScene(document.querySelector<HTMLElement>('#scene')!, async signal => {
  const { createAssembly } = await import('./assembly.ts')
  return createAssembly(signal)
}, { signal: abort.signal, view: {
  onActionProgress(progress) {
    controls.forEach(button => { button.disabled = !progress.ready })
    status.textContent = progress.error ?? (progress.ready ? '就绪' : '准备动作')
  },
} }).then(({ runtime, dispose }) => {
  let currentId: string | undefined
  const unsubscribe = runtime.subscribe(() => {
    const record = currentId && runtime.getRecord(currentId)
    if (record && record.status !== 'running' && record.status !== 'queued') {
      status.textContent = record.error?.message ?? (record.status === 'completed' ? '已到达' : '已取消')
      currentId = undefined
    }
  })
  const listeners: (() => void)[] = []
  for (const button of controls) {
    const click = () => {
      const commandId = crypto.randomUUID(), base = { protocolVersion: '2.0' as const, sceneId: runtime.sceneId, commandId }
      if (button.id === 'cancel') {
        if (currentId) runtime.submit({ ...base, type: 'command.cancel', targetCommandId: currentId })
        return
      }
      if (currentId) runtime.submit({ ...base, type: 'command.cancel', targetCommandId: currentId })
      const id = crypto.randomUUID()
      currentId = id
      const result = runtime.submit({ ...base, commandId: id, type: 'activity.start', capability: 'scene.move',
        participants: [{ entityId: 'walker', role: 'actor' }], params: { targetId: button.dataset.target!, anchor: 'approach' } })
      status.textContent = result.error?.message ?? '行走中'
    }
    button.addEventListener('click', click); listeners.push(() => button.removeEventListener('click', click))
  }
  cleanup = () => { listeners.forEach(remove => remove()); unsubscribe(); dispose() }
  if (abort.signal.aborted) cleanup()
}).catch(error => { if (!abort.signal.aborted) status.textContent = String(error) })
const dispose = () => { window.removeEventListener('pagehide', dispose); abort.abort(); cleanup?.() }
window.addEventListener('pagehide', dispose, { once: true })
import.meta.hot?.dispose(dispose)
