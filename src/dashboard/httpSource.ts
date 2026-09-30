import type { DashboardAction, OfficeDataSource } from './contract'
import { parseDashboardSnapshot } from './contract'

export class HttpOfficeDataSource implements OfficeDataSource {
  readonly kind = 'http'
  private readonly baseUrl: string
  private readonly pollMs: number
  constructor(baseUrl: string, pollMs = 3000) { this.baseUrl = baseUrl; this.pollMs = pollMs }

  async getSnapshot() {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/snapshot`, { headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`页面数据请求失败：HTTP ${response.status}`)
    return parseDashboardSnapshot(await response.json())
  }

  subscribe(listener: () => void) {
    const timer = setInterval(listener, this.pollMs)
    return () => clearInterval(timer)
  }

  async execute(action: DashboardAction) {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/actions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action),
    })
    if (!response.ok) throw new Error(`业务操作失败：HTTP ${response.status}`)
  }
}
