/** Bound texture downloads across the office and sidebar without serializing whole packs. */
export class AssetLoadQueue {
  private active = 0
  private pending: Array<() => void> = []
  private concurrency: number

  constructor(concurrency = 4) {
    if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('Invalid asset concurrency')
    this.concurrency = concurrency
  }

  run<T>(load: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.push(() => {
        this.active++
        const finish = () => { this.active--; this.drain() }
        Promise.resolve().then(load).then(value => { resolve(value); finish() }, error => { reject(error); finish() })
      })
      this.drain()
    })
  }

  private drain() {
    while (this.active < this.concurrency && this.pending.length) this.pending.shift()!()
  }
}

export const textureLoadQueue = new AssetLoadQueue(4)
