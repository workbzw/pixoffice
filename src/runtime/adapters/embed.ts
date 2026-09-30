import type { OfficeRuntime } from '../OfficeRuntime'

/** Opt-in embedding; the caller supplies the exact trusted parent origin. */
export function attachParentBridge(runtime: OfficeRuntime, parentOrigin: string) {
  const origin = new URL(parentOrigin).origin
  if (origin === 'null') throw new Error('Opaque origins are not supported')
  const receive = (event: MessageEvent) => {
    if (event.origin !== origin || event.source !== window.parent || window.parent === window) return
    const data = event.data
    if (!data || data.channel !== 'ai-office.v1' || typeof data.requestId !== 'string' || data.requestId.length > 100) return
    let result: unknown
    try {
      if (data.type === 'describe') result = runtime.describe()
      else if (data.type === 'snapshot') result = runtime.snapshot()
      else if (data.type === 'command') result = runtime.submit(data.command)
      else if (data.type === 'batch') result = runtime.submitBatch(data.batch)
      else result = { error: 'UNSUPPORTED_MESSAGE' }
    } catch (error) { result = { error: String(error) } }
    window.parent.postMessage({ channel: 'ai-office.v1', requestId: data.requestId, result }, origin)
  }
  window.addEventListener('message', receive)
  return () => window.removeEventListener('message', receive)
}
