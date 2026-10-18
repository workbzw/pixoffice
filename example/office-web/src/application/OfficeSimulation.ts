import type { SceneRuntime } from '@pixoffice/runtime/SceneRuntime'
import { SceneFault } from '@pixoffice/protocol'
import type { OfficeDemoSource } from '../dashboard/OfficeDemoSource.ts'

/** Advances accepted scene behaviors only; business state comes from data events. */
export class OfficeSimulation {
  readonly runtime: SceneRuntime
  readonly demoSource?: OfficeDemoSource

  constructor(runtime: SceneRuntime, demoSource?: OfficeDemoSource) { this.runtime = runtime; this.demoSource = demoSource }
  get canDemo() { return Boolean(this.demoSource) }
  get isDemoRunning() { return this.demoSource?.isRunning ?? false }
  get error() { return this.demoSource?.error ?? null }
  subscribe = (listener: () => void) => this.demoSource?.subscribe(listener) ?? (() => {})

  setDemo(enabled: boolean) {
    if (enabled && !this.demoSource) throw new SceneFault('DEMO_DISABLED', '真实数据模式不启用演示数据源')
    this.demoSource?.setEnabled(enabled)
  }

  tick(elapsedMs: number) {
    this.runtime.tick(elapsedMs)
  }
}

export function advanceOfficeSimulations(simulations: Iterable<OfficeSimulation>, elapsedMs: number) {
  const current = [...simulations]
  // Bound catch-up after browser suspension, and keep navigation on small time steps.
  let remaining = Number.isFinite(elapsedMs) ? Math.max(0, Math.min(elapsedMs, 1000)) : 0
  while (remaining > 0) {
    const step = Math.min(remaining, 50)
    for (const simulation of current) simulation.tick(step)
    remaining -= step
  }
}
