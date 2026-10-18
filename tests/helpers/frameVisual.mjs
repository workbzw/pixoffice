import assert from 'node:assert/strict'
import { characterPackFixture } from './characterPack.mjs'

export async function frameVisualFixture(t, server, id = 'office-lead', suppliedPack) {
  const pack = suppliedPack ?? await characterPackFixture(id)
  pack.ensureClips = async () => {}
  const { FrameAdapter } = await server.ssrLoadModule('/packages/animation-frame/src/FrameAdapter.ts')
  const { bindOfficeFrames } = await server.ssrLoadModule('/packages/assets-office/src/frame/bindings.ts')
  const { AnimationPresenter } = await server.ssrLoadModule('/packages/renderer-pixi/src/presentation/AnimationPresenter.ts')
  const { sampleCharacterClip } = await server.ssrLoadModule('/packages/assets-office/src/frame/packSchema.ts')
  const manifest = bindOfficeFrames(pack.manifest, '/test/character.json')
  const lease = await new FrameAdapter(async () => ({ value: pack, release() {} })).acquire(manifest, new AbortController().signal)
  const presenter = new AnimationPresenter()
  let visual, lastState
  const apply = state => {
    if (visual) visual.sample(state)
    else visual = lease.create(state)
    lastState = state
    return visual.root
  }
  t.after(() => { visual?.dispose(); lease.release(); if (!suppliedPack) pack.dispose() })
  return {
    pack, manifest,
    get root() { return visual?.root },
    get visual() { return visual },
    get state() { return lastState },
    texture(clip, time = 0, progress) {
      return pack.textures.get(sampleCharacterClip(pack.manifest, clip, time, progress).key)
    },
    sample({ actionId = 'core.idle', poseId = 'standing', view = 'front', elapsedMs = 0, progress, travelledDu, speechMs } = {}) {
      const base = manifest.capabilities.variants.find(v => v.actionId === actionId && v.poseId === poseId && v.view === view)
      assert(base, `Unsupported test request: ${actionId}/${poseId}/${view}`)
      const speech = speechMs === undefined ? undefined : manifest.capabilities.variants.find(v => v.actionId === 'core.speak' && v.poseId === poseId && v.view === view)
      const variants = [base, ...(speech ? [speech] : [])]
      return apply({ entityId: id, request: { poseId, view, variantIds: variants.map(v => v.variantId) }, contacts: [],
        actions: variants.map(v => ({ instanceId: v.variantId, variantId: v.variantId, clock: v.channel === 'speech'
          ? { mode: 'time', elapsedMs: speechMs, loop: true }
          : progress !== undefined ? { mode: 'progress', progress }
          : travelledDu !== undefined ? { mode: 'distance', travelledDu, strideDu: .72 }
          : { mode: 'time', elapsedMs, loop: true } })) })
    },
    present(actor, dt = 0) { return apply(presenter.sample(actor, manifest, dt)) },
  }
}
