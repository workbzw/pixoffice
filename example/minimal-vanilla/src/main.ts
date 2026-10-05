import { createSceneRuntime } from '@pixoffice/runtime'
import { AnimationRegistry, SceneView } from '@pixoffice/renderer-pixi'
import { FrameAdapter } from '@pixoffice/animation-frame'
import { officeScenePack } from '@pixoffice/scene-office'
import { createOfficePresentation, configureOfficeAssets } from '@pixoffice/scene-office/pixi'
import type { Container } from 'pixi.js'
import { visualAssetManifestSchema } from '@pixoffice/contracts'
import './style.css'

const host = document.querySelector<HTMLElement>('#office')!
const status = document.querySelector<HTMLOutputElement>('#status')!
const visitor = document.querySelector<HTMLSelectElement>('#visitor')!
const recipient = document.querySelector<HTMLSelectElement>('#host')!
const send = document.querySelector<HTMLButtonElement>('#send')!
const runtime = createSceneRuntime(officeScenePack)
configureOfficeAssets({ baseUrl: `${import.meta.env.BASE_URL}assets/office` })
const scene = new SceneView({
  runtime, pack: createOfficePresentation(),
  animations: new AnimationRegistry<Container>().register(new FrameAdapter()),
  onStep: elapsed => runtime.tick(elapsed),
  dispatchCommand: command => runtime.submit(command),
  async resolveAppearance(id) {
    const url = new URL(`${import.meta.env.BASE_URL}characters/visuals/${encodeURIComponent(id)}.json`, document.baseURI)
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Appearance ${id}: HTTP ${response.status}`)
    const manifest = visualAssetManifestSchema.parse(await response.json())
    manifest.source.uri = new URL(manifest.source.uri, url).href
    return manifest
  },
  onActionProgress: progress => {
    send.disabled = !progress.ready
    status.textContent = progress.error ?? (progress.ready ? '就绪' : `准备动作 ${progress.completed}/${progress.total}`)
  },
})
for (const actor of runtime.readActors()) {
  visitor.add(new Option(actor.name, actor.id))
  recipient.add(new Option(actor.name, actor.id))
}
recipient.selectedIndex = 1
document.querySelector<HTMLFormElement>('#visit-form')!.addEventListener('submit', event => {
  event.preventDefault()
  const result = runtime.submit({
    protocolVersion: '2.0', sceneId: runtime.sceneId, commandId: crypto.randomUUID(),
    type: 'activity.start', capability: 'office.visit',
    participants: [{ entityId: visitor.value, role: 'visitor' }, { entityId: recipient.value, role: 'host' }],
    params: { stops: [{ hostId: recipient.value, message: '请接手下一步。' }] },
  })
  status.textContent = result.error?.message ?? '拜访中'
})
const unsubscribe = runtime.subscribe(() => {
  const records = runtime.snapshot().records
  const latest = records.at(-1)
  if (latest?.status === 'completed') status.textContent = '拜访完成'
})
const observer = new ResizeObserver(() => scene.resize(host.clientWidth, host.clientHeight))
observer.observe(host)
void scene.init(host, host.clientWidth, host.clientHeight).catch(error => { status.textContent = String(error) })
function dispose() { observer.disconnect(); unsubscribe(); scene.destroy(); runtime.dispose() }
window.addEventListener('pagehide', dispose, { once: true })
import.meta.hot?.dispose(dispose)
