import { mountScene } from '@pixoffice/renderer-pixi'
import './style.css'

const host = document.querySelector<HTMLElement>('#office')!
const status = document.querySelector<HTMLOutputElement>('#status')!
const visitor = document.querySelector<HTMLSelectElement>('#visitor')!
const recipient = document.querySelector<HTMLSelectElement>('#host')!
const send = document.querySelector<HTMLButtonElement>('#send')!
send.disabled = true
const abort = new AbortController()
const abortLoad = () => abort.abort()
window.addEventListener('pagehide', abortLoad, { once: true })
import.meta.hot?.dispose(() => { window.removeEventListener('pagehide', abortLoad); abortLoad() })
const mounted = await mountScene(host, async signal => {
  const { createAssembly } = await import('./assembly.ts')
  return createAssembly(signal)
}, { signal: abort.signal, view: {
  onActionProgress: progress => {
    send.disabled = !progress.ready
    status.textContent = progress.error ?? (progress.ready ? '就绪' : `准备动作 ${progress.completed}/${progress.total}`)
  },
} }).catch(error => { status.textContent = String(error); return undefined })
if (mounted) {
  const { runtime } = mounted
  visitor.replaceChildren(); recipient.replaceChildren()
  for (const actor of runtime.readActors()) {
    visitor.add(new Option(actor.name, actor.id))
    recipient.add(new Option(actor.name, actor.id))
  }
  recipient.selectedIndex = 1
  const form = document.querySelector<HTMLFormElement>('#visit-form')!
  const submit = (event: SubmitEvent) => {
    event.preventDefault()
    const result = runtime.submit({
      protocolVersion: '2.0', sceneId: runtime.sceneId, commandId: crypto.randomUUID(),
      type: 'activity.start', capability: 'office.visit',
      participants: [{ entityId: visitor.value, role: 'visitor' }, { entityId: recipient.value, role: 'host' }],
      params: { stops: [{ hostId: recipient.value, message: '请接手下一步。' }] },
    })
    status.textContent = result.error?.message ?? '拜访中'
  }
  form.addEventListener('submit', submit)
  const unsubscribe = runtime.subscribe(() => {
    const records = runtime.snapshot().records
    const latest = records.at(-1)
    if (latest?.status === 'completed') status.textContent = '拜访完成'
  })
  function dispose() { form.removeEventListener('submit', submit); window.removeEventListener('pagehide', dispose); unsubscribe(); mounted!.dispose() }
  window.addEventListener('pagehide', dispose, { once: true })
  import.meta.hot?.dispose(dispose)
}
