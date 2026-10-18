export type Subscriber = { teams: ReadonlySet<string>; send: (frame: string) => boolean; close: () => void }

/** Stores live connections only. No messages, cursors, leases or execution records. */
export class MessageRelay {
  private readonly subscribers = new Set<Subscriber>()
  get size() { return this.subscribers.size }
  hasReceiver(teamId: string, sharedTopic?: string) { return [...this.subscribers].some(subscriber => subscriber.teams.has(teamId) || Boolean(sharedTopic && subscriber.teams.has(sharedTopic))) }
  add(subscriber: Subscriber) {
    this.subscribers.add(subscriber)
    return () => { this.subscribers.delete(subscriber) }
  }
  publish(teamId: string, frame: string, sharedTopic?: string) {
    let matched = 0, forwarded = 0
    for (const subscriber of this.subscribers) {
      if (!subscriber.teams.has(teamId) && (!sharedTopic || !subscriber.teams.has(sharedTopic))) continue
      matched++
      try { if (subscriber.send(frame)) forwarded++ }
      catch { subscriber.close(); this.subscribers.delete(subscriber) }
    }
    return { matched, forwarded }
  }
  close() {
    for (const subscriber of [...this.subscribers]) subscriber.close()
    this.subscribers.clear()
  }
}
