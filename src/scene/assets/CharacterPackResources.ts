import { Assets, Rectangle, Texture } from 'pixi.js'
import { characterFrameDependencies, type CharacterManifest } from '../characters/packSchema'
import { textureLoadQueue } from './AssetLoadQueue'

/** Owns progressive atlas pages; callers retain the pack through ResourceLeaseCache. */
export class CharacterPackResources {
  readonly manifest: CharacterManifest
  readonly pageUrls: string[]
  readonly textures = new Map<string, Texture>()
  private pages = new Map<number, Texture>()
  private pending = new Map<number, Promise<void>>()
  private disposed = false
  private disposal?: Promise<void>

  constructor(manifest: CharacterManifest, pageUrls: string[]) {
    this.manifest = manifest
    this.pageUrls = pageUrls
  }

  get isComplete() { return this.pages.size === this.manifest.pages.length }

  ensureStartup() {
    const grouped = this.manifest.pages.some(page => page.group === 'startup')
    return this.ensurePages(this.manifest.pages.flatMap((page, index) => !grouped || page.group === 'startup' ? [index] : []))
  }
  ensureClips(names: string[]) {
    return this.ensurePages(characterFrameDependencies(this.manifest, names).map(key => this.manifest.frames[key].page))
  }
  ensureAll() { return this.ensurePages(this.manifest.pages.map((_, index) => index)) }

  private async ensurePages(indices: number[]) {
    if (this.disposed) throw new Error('Character pack disposed')
    const results = await Promise.allSettled([...new Set(indices)].map(index => this.loadPage(index)))
    const failed = results.find(result => result.status === 'rejected')
    if (failed?.status === 'rejected') throw failed.reason
  }

  private loadPage(index: number): Promise<void> {
    if (this.pages.has(index)) return Promise.resolve()
    const existing = this.pending.get(index)
    if (existing) return existing
    const pageUrl = this.pageUrls[index]
    const pending = textureLoadQueue.run(async () => {
      if (this.disposed) throw new Error('Character pack disposed')
      const texture = await Assets.load<Texture>(pageUrl)
      const expected = this.manifest.pages[index]
      if (texture.width !== expected.width || texture.height !== expected.height) {
        await Assets.unload(pageUrl)
        throw new Error(`Character atlas dimensions mismatch: ${pageUrl}`)
      }
      this.pages.set(index, texture)
      if (this.disposed) throw new Error('Character pack disposed')
      for (const [key, frame] of Object.entries(this.manifest.frames)) {
        if (frame.page !== index) continue
        this.textures.set(key, new Texture({ source: texture.source,
          frame: new Rectangle(frame.rect.x, frame.rect.y, frame.rect.width, frame.rect.height),
          orig: new Rectangle(0, 0, this.manifest.canvas.width, this.manifest.canvas.height),
          trim: new Rectangle(frame.offset.x, frame.offset.y, frame.rect.width, frame.rect.height),
        }))
      }
    }).finally(() => { this.pending.delete(index) })
    this.pending.set(index, pending)
    return pending
  }

  dispose(): Promise<void> {
    if (this.disposal) return this.disposal
    this.disposed = true
    return this.disposal = (async () => {
      await Promise.allSettled([...this.pending.values()])
      for (const texture of this.textures.values()) texture.destroy()
      this.textures.clear()
      await Promise.allSettled([...this.pages.keys()].map(index => Assets.unload(this.pageUrls[index])))
      this.pages.clear()
    })()
  }
}
