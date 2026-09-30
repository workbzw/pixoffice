type Disposable = { dispose(): void | Promise<void> }
type Entry<T> = { promise: Promise<T>; value?: T; references: number; timer?: ReturnType<typeof setTimeout> }

/** Scene and preview own separate leases; neither can unload the other's textures. */
export class ResourceLeaseCache<T extends Disposable> {
  private entries = new Map<string, Entry<T>>()
  private retiring = new Map<string, Promise<void>>()
  private load: (id: string) => Promise<T>
  private idleMs: number
  constructor(load: (id: string) => Promise<T>, idleMs = 30000) { this.load = load; this.idleMs = idleMs }
  get(id: string) { return this.entries.get(id)?.value }
  async acquire(id: string) {
    let entry = this.entries.get(id)
    if (!entry) {
      const created: Entry<T> = { references: 0, promise: (this.retiring.get(id) ?? Promise.resolve()).then(() => this.load(id)) }
      created.promise = created.promise.then(value => { created.value = value; return value }).catch(error => {
        if (this.entries.get(id) === created) this.entries.delete(id)
        throw error
      })
      entry = created
      this.entries.set(id, entry)
    }
    if (entry.timer) clearTimeout(entry.timer)
    entry.references++
    let value: T
    try { value = await entry.promise } catch (error) { entry.references--; throw error }
    let released = false
    return { value, release: () => {
      if (released) return
      released = true
      entry.references--
      if (entry.references === 0) entry.timer = setTimeout(() => this.evict(id, entry), this.idleMs)
    } }
  }
  private evict(id: string, entry: Entry<T>) {
    if (entry.references || this.entries.get(id) !== entry) return
    this.entries.delete(id)
    if (entry.timer) clearTimeout(entry.timer)
    const retirement = Promise.resolve().then(() => entry.value?.dispose()).catch(error => {
      console.warn(`[Characters] Resource disposal failed: ${id}`, error)
    }).finally(() => { if (this.retiring.get(id) === retirement) this.retiring.delete(id) })
    this.retiring.set(id, retirement)
  }
  clearUnused() { for (const [id, entry] of this.entries) this.evict(id, entry) }
}
