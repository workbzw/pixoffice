export type ActorInsightTarget = { actorId: string; clientX: number; clientY: number }
export type ActorInsightSelection = ActorInsightTarget & { pinned: boolean }

/** Hover timing is independent of both Pixi rendering and business statistics. */
export class ActorInsightInteraction {
  private selection?: ActorInsightSelection
  private closing?: ReturnType<typeof setTimeout>
  private insidePopover = false
  private listeners = new Set<() => void>()
  getSnapshot = () => this.selection
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(selection?: ActorInsightSelection) {
    this.selection = selection
    this.listeners.forEach(listener => listener())
  }
  private clearClosing() {
    clearTimeout(this.closing)
    this.closing = undefined
  }
  enter(target: ActorInsightTarget) {
    if (this.selection?.pinned) return
    this.clearClosing()
    if (this.selection?.actorId === target.actorId) return
    this.insidePopover = false
    this.publish({ ...target, pinned: false })
  }
  leave(actorId: string) {
    if (this.selection?.pinned) return
    if (this.selection?.actorId !== actorId) return
    if (this.insidePopover) return
    clearTimeout(this.closing)
    this.closing = setTimeout(() => { this.closing = undefined; this.publish() }, 240)
  }
  retain() { this.insidePopover = true; this.clearClosing() }
  leavePopover(actorId: string) { this.insidePopover = false; this.leave(actorId) }
  open(target: ActorInsightTarget) { this.clearClosing(); this.publish({ ...target, pinned: true }) }
  pin() { if (this.selection) this.open(this.selection) }
  togglePin() {
    if (!this.selection) return
    this.clearClosing()
    const next = { ...this.selection, pinned: !this.selection.pinned }
    this.publish(next)
    if (!next.pinned && !this.insidePopover) this.leave(next.actorId)
  }
  close = () => { this.insidePopover = false; this.clearClosing(); this.publish() }
  dispose() { this.insidePopover = false; this.clearClosing(); this.listeners.clear(); this.selection = undefined }
}

export function placeActorInsights(anchor: { x: number; y: number }, size: { width: number; height: number }, viewport: { width: number; height: number }) {
  const gap = 36, margin = 12
  const side = anchor.x + gap + size.width <= viewport.width - margin ? 'right' : 'left'
  const desired = side === 'right' ? anchor.x + gap : anchor.x - gap - size.width
  return { side, left: Math.max(margin, Math.min(desired, viewport.width - size.width - margin)),
    top: Math.max(margin, Math.min(anchor.y - size.height / 2, viewport.height - size.height - margin)) }
}
