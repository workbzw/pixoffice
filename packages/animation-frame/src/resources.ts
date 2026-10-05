import { CharacterManifestSchema, CharacterRegistrySchema, type CharacterRegistry } from './packSchema.ts'
import { ResourceLeaseCache } from './resources/ResourceLeaseCache.ts'
import { CharacterPackResources } from './CharacterPackResources.ts'

export type CharacterPack = CharacterPackResources
let registryPromise: Promise<CharacterRegistry> | undefined
const manifests = new Map<string, Promise<{ manifest: import('./packSchema.ts').CharacterManifest; url: string }>>()
const manifestUrls = new Map<string, string>()
let resourceBase = '/characters'
export const characterResourceUrl = (path: string) => `${resourceBase}/${path}`
const canonicalUrl = (url: string) => typeof document === 'undefined' ? url : new URL(url, document.baseURI).href
/** Configure once before loading; separate hosts may use a subpath or CDN. */
export function configureCharacterResources(baseUrl: string) {
  const next = baseUrl.replace(/\/$/, '')
  if (registryPromise && resourceBase !== next) throw new Error('Configure character resources before loading')
  resourceBase = next
}
async function readJson(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Character resource ${url}: HTTP ${response.status}`)
  return response.json()
}
export function loadCharacterRegistry(): Promise<CharacterRegistry> {
  return registryPromise ??= readJson(`${resourceBase}/registry.json`).then(data => CharacterRegistrySchema.parse(data)).catch(error => {
    registryPromise = undefined
    throw error
  })
}
export async function readCharacterManifest(id: string) {
  const registry = await loadCharacterRegistry()
  const entry = registry.characters.find(character => character.id === id)
  if (!entry) throw new Error(`Unknown character resource pack: ${id}`)
  const url = canonicalUrl(`${resourceBase}/${entry.manifest}`)
  manifestUrls.set(id, url)
  return readManifestUrl(url, id)
}
async function readManifestUrl(url: string, id?: string) {
  let pending = manifests.get(url)
  if (!pending) {
    pending = readJson(url).then(data => {
      const manifest = CharacterManifestSchema.parse(data)
      if (id && manifest.id !== id) throw new Error(`Character manifest ID mismatch: ${id}`)
      return { manifest, url }
    }).catch(error => { manifests.delete(url); throw error })
    manifests.set(url, pending)
  }
  return pending
}
async function loadPack(url: string): Promise<CharacterPack> {
  const { manifest } = await readManifestUrl(url)
  const pageUrls = manifest.pages.map(page => `${url.slice(0, url.lastIndexOf('/') + 1)}${page.image}`)
  const pack = new CharacterPackResources(manifest, pageUrls)
  try {
    await pack.ensureStartup()
    return pack
  } catch (error) { await pack.dispose(); throw error }
}
/** Scene and preview share lease ownership, including across development hot replacements. */
const resourceCache = ResourceLeaseCache.retained(loadPack, import.meta.hot?.data)
export const characterAssets = {
  async acquire(id: string, manifestUrl?: string) {
    const url = canonicalUrl(manifestUrl ?? (await readCharacterManifest(id)).url)
    manifestUrls.set(id, url)
    return resourceCache.acquire(url)
  },
  get(id: string) { const url = manifestUrls.get(id); return url ? resourceCache.get(url) : undefined },
}
export const getCharacterPack = (id: string) => characterAssets.get(id)
type CharacterLoadOptions = { preload: 'startup' | 'all'; clipsForPack?: (pack: CharacterPack) => string[] }
export async function acquireCharacterPacks(ids: string[], onLoaded?: (id: string) => void, options: CharacterLoadOptions = { preload: 'all' }) {
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
