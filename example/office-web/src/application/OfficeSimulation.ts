import type { SceneRuntime } from '@pixoffice/runtime/SceneRuntime'
import { SceneFault } from '@pixoffice/protocol'
import type { OfficeDemoSource } from '../dashboard/OfficeDemoSource.ts'
import { OfficeActionDemo } from './OfficeActionDemo.ts'

export type OfficeDemoMode = 'scenario' | 'actions'

/** Advances accepted scene behaviors only; business state comes from data events. */
export class OfficeSimulation {
  readonly runtime: SceneRuntime
  readonly demoSource?: OfficeDemoSource
  private readonly actionDemo?: OfficeActionDemo
  private mode: OfficeDemoMode = 'scenario'
  readonly scenarioLabel: string

  constructor(runtime: SceneRuntime, demoSource?: OfficeDemoSource, scenarioLabel = '工位协作') {
    this.runtime = runtime; this.demoSource = demoSource; this.scenarioLabel = scenarioLabel
    if (demoSource) this.actionDemo = new OfficeActionDemo(runtime)
  }
  get canDemo() { return Boolean(this.demoSource) }
  get isDemoRunning() { return Boolean(this.demoSource?.isRunning || this.actionDemo?.isRunning) }
  get isScenarioRunning() { return this.demoSource?.isRunning ?? false }
  get demoMode() { return this.mode }
  get demoStatus() { return this.mode === 'actions' ? this.actionDemo?.status ?? '' : '' }
  get error() { return this.mode === 'actions' ? this.actionDemo?.error ?? null : this.demoSource?.error ?? null }
  subscribe = (listener: () => void) => {
    const unsubscribers = [this.demoSource?.subscribe(listener), this.actionDemo?.subscribe(listener)]
    return () => { for (const unsubscribe of unsubscribers) unsubscribe?.() }
  }

  setDemo(enabled: boolean) {
    if (enabled && !this.demoSource) throw new SceneFault('DEMO_DISABLED', '真实数据模式不启用演示数据源')
    if (this.mode === 'actions') this.actionDemo?.setEnabled(enabled)
    else this.demoSource?.setEnabled(enabled)
  }

  setDemoMode(mode: OfficeDemoMode) {
    if (mode === this.mode) return
    const running = this.isDemoRunning
    this.setDemo(false)
    this.mode = mode
    if (running) this.setDemo(true)
  }

  tick(elapsedMs: number) {
    this.runtime.tick(elapsedMs)
    this.actionDemo?.tick(elapsedMs)
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
