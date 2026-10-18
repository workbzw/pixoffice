/** A view observer must not turn an accepted state update into a failed operation. */
export function notifySubscribers(listeners: Iterable<() => void>, source: string) {
  for (const listener of [...listeners]) {
    try { listener() }
    catch (error) { console.warn(`[${source}] subscriber failed`, error) }
  }
}
