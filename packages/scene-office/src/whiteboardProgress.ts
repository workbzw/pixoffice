import type { WhiteboardTaskBoardData } from '@pixoffice/protocol/office-ui'

type Entry = { key: string; status: WhiteboardTaskBoardData['status']; at: number; values: Map<string, number> }
const LIMIT = 99
const DURATION_MS = 90000
const reported = (value?: number) => value !== undefined && Number.isFinite(value) && value >= 0 ? Math.min(LIMIT, value) : 0

/** Display-only activity progress; the business payload is never changed. */
export class WhiteboardProgress {
  private entries = new Map<string, Entry>()
  private now: () => number
  private reduceMotion: boolean

  constructor(options: { now?: () => number; reduceMotion?: boolean } = {}) {
    this.now = options.now ?? (() => performance.now())
    this.reduceMotion = options.reduceMotion ?? false
  }

  project(id: string, board: WhiteboardTaskBoardData): WhiteboardTaskBoardData {
    const now = this.now(), key = JSON.stringify([board.title, board.steps.map(step => [step.id, step.title])])
    let entry = this.entries.get(id)
    if (!entry || entry.key !== key || entry.status === 'completed' && board.status !== 'completed') {
      entry = { key, status: board.status, at: now, values: new Map(board.steps.map(step => [step.id, reported(step.progress)])) }
      this.entries.set(id, entry)
    }
    const elapsed = Math.max(0, now - entry.at)
    for (const step of board.steps) {
      let value = entry.values.get(step.id) ?? 0
      if (entry.status === 'running' && !this.reduceMotion) value = LIMIT - (LIMIT - value) * Math.exp(-elapsed / DURATION_MS)
      entry.values.set(step.id, board.status === 'completed' ? 100 : Math.min(LIMIT, Math.max(value, reported(step.progress))))
    }
    entry.status = board.status; entry.at = Math.max(entry.at, now)
    return { ...board, steps: board.steps.map(step => ({ ...step, progress: Math.floor(entry.values.get(step.id) ?? 0) })) }
  }
}
