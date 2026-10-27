import { CharacterManifestSchema, CharacterRegistrySchema, type CharacterRegistry } from './packSchema.ts'
import { ResourceLeaseCache } from './resources/ResourceLeaseCache.ts'
import { CharacterPackResources } from './CharacterPackResources.ts'

import { characterFrameDependencies, type CharacterManifest } from './packSchema.ts'

export type CharacterPack = CharacterPackResources

class CharacterResourceError extends Error {
  readonly unavailable: boolean
  constructor(message: string, unavailable = false, options?: ErrorOptions) {
    super(message, options)
    this.name = 'CharacterResourceError'
    this.unavailable = unavailable
  }
}

export function createCharacterResources<T extends CharacterManifest>(options: {
  parseManifest(data: unknown): T
  dependencies?: (manifest: T, names: string[]) => string[]
  cacheData?: Record<string, unknown>
}) {
  let registryPromise: Promise<CharacterRegistry> | undefined
  const manifests = new Map<string, Promise<{ manifest: T; url: string }>>()
  const manifestUrls = new Map<string, string>()
  let resourceBase = '/characters'
  const characterResourceUrl = (path: string) => `${resourceBase}/${path}`
  const canonicalUrl = (url: string) => typeof document === 'undefined' ? url : new URL(url, document.baseURI).href
  /** Configure once before loading; separate hosts may use a subpath or CDN. */
  function configureCharacterResources(baseUrl: string) {
    const next = baseUrl.replace(/\/$/, '')
    if (registryPromise && resourceBase !== next) throw new Error('Configure character resources before loading')
    resourceBase = next
  }
  async function readJson(url: string, revalidate = false) {
    const response = await fetch(url, revalidate ? { cache: 'no-cache' } : undefined)
    if (!response.ok) throw new CharacterResourceError(`Character resource ${url}: HTTP ${response.status}`, [404, 410].includes(response.status))
    if (response.headers.get('content-type')?.toLowerCase().includes('text/html')) {
      throw new CharacterResourceError(`Character resource ${url}: expected JSON but received an HTML page. The resource may have changed or the URL is incorrect; refresh the page and retry.`, true)
    }
    try { return await response.json() }
    catch (cause) { throw new CharacterResourceError(`Character resource ${url}: invalid JSON response`, false, { cause }) }
  }
  function loadCharacterRegistry(): Promise<CharacterRegistry> {
    return registryPromise ??= readJson(`${resourceBase}/registry.json`, true).then(data => CharacterRegistrySchema.parse(data)).catch(error => {
      registryPromise = undefined
      throw error
    })
  }
  async function readCharacterManifest(id: string) {
    const registryRequest = loadCharacterRegistry()
    const registry = await registryRequest
    const entry = registry.characters.find(character => character.id === id)
    if (!entry) throw new Error(`Unknown character resource pack: ${id}`)
    const url = canonicalUrl(`${resourceBase}/${entry.manifest}`)
    try {
      const result = await readManifestUrl(url, id)
      manifestUrls.set(id, url)
      return result
    } catch (error) {
      if (!(error instanceof CharacterResourceError) || !error.unavailable) throw error
      // A live page may retain a registry whose content-addressed files were replaced.
      // Share one refresh across concurrent misses, and retry only a changed URL.
      if (registryPromise === registryRequest) registryPromise = undefined
      const latest = await loadCharacterRegistry()
      const replacement = latest.characters.find(character => character.id === id)
      const nextUrl = replacement && canonicalUrl(`${resourceBase}/${replacement.manifest}`)
      if (!nextUrl || nextUrl === url) throw error
      const result = await readManifestUrl(nextUrl, id)
      manifestUrls.set(id, nextUrl)
      return result
    }
  }
  async function readManifestUrl(url: string, id?: string) {
    let pending = manifests.get(url)
    if (!pending) {
      pending = readJson(url).then(data => {
        const manifest = options.parseManifest(data)
        return { manifest, url }
      }).catch(error => { manifests.delete(url); throw error })
      manifests.set(url, pending)
    }
    const result = await pending
    if (id && result.manifest.id !== id) throw new Error(`Character manifest ID mismatch: ${id}`)
    return result
  }
  async function loadPack(url: string): Promise<CharacterPackResources<T>> {
    const { manifest } = await readManifestUrl(url)
    const pageUrls = manifest.pages.map(page => `${url.slice(0, url.lastIndexOf('/') + 1)}${page.image}`)
    const pack = new CharacterPackResources(manifest, pageUrls, options.dependencies)
    try {
      await pack.ensureStartup()
      return pack
    } catch (error) { await pack.dispose(); throw error }
  }
  /** Scene and preview share lease ownership, including across development hot replacements. */
  const resourceCache = ResourceLeaseCache.retained(loadPack, options.cacheData)
  const characterAssets = {
    async acquire(id: string, manifestUrl?: string) {
      const url = canonicalUrl(manifestUrl ?? (await readCharacterManifest(id)).url)
      const lease = await resourceCache.acquire(url)
      if (lease.value.manifest.id !== id) {
        lease.release()
        throw new Error(`Character manifest ID mismatch: ${id}`)
      }
      manifestUrls.set(id, url)
      return lease
    },
    get(id: string) { const url = manifestUrls.get(id); return url ? resourceCache.get(url) : undefined },
  }
  const getCharacterPack = (id: string) => characterAssets.get(id)
  type CharacterLoadOptions = { preload: 'startup' | 'all'; clipsForPack?: (pack: CharacterPackResources<T>) => string[] }
  async function acquireCharacterPacks(ids: string[], onLoaded?: (id: string) => void, options: CharacterLoadOptions = { preload: 'all' }) {
    const leases: Array<Awaited<ReturnType<typeof characterAssets.acquire>>> = []
    try {
      // Wait for every acquisition before releasing on failure, including late successful loads.
      const results = await Promise.allSettled([...new Set(ids)].map(async id => {
        const lease = await characterAssets.acquire(id)
        leases.push(lease)
        if (options.preload === 'all') await lease.value.ensureAll()
        else if (options.clipsForPack) await lease.value.ensureClips(options.clipsForPack(lease.value))
        onLoaded?.(id)
        return lease
      }))
      const failed = results.find(result => result.status === 'rejected')
      if (failed?.status === 'rejected') throw failed.reason
      const ordered = results.map(result => {
        if (result.status === 'rejected') throw result.reason
        return result.value
      })
      return { packs: ordered.map(lease => lease.value), release: () => leases.forEach(lease => lease.release()) }
    } catch (error) { leases.forEach(lease => lease.release()); throw error }
  }

  return { configureCharacterResources, characterResourceUrl, loadCharacterRegistry, readCharacterManifest, characterAssets, getCharacterPack, acquireCharacterPacks }
}
const defaults = createCharacterResources({
  parseManifest: data => CharacterManifestSchema.parse(data), dependencies: characterFrameDependencies, cacheData: import.meta.hot?.data,
})
export const { configureCharacterResources, characterResourceUrl, loadCharacterRegistry, readCharacterManifest, characterAssets, getCharacterPack, acquireCharacterPacks } = defaults
