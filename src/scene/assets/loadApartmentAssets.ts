import { AGENT_ROSTER } from '@/scene/layout/officeLayout'
import { CharacterManifestSchema, CharacterRegistrySchema, resolveCharacterClip, type CharacterRegistry } from '@/scene/characters/packSchema'
import { ResourceLeaseCache } from './ResourceLeaseCache'
import { CharacterPackResources } from './CharacterPackResources'
import { characterPoseClip, supportsOfficePose } from '@/contracts/characterPose'
import type { PoseSupport } from '@/runtime/actionContract'

export type CharacterPack = CharacterPackResources
let registryPromise: Promise<CharacterRegistry> | undefined
let resourceBase = '/characters'
export const characterResourceUrl = (path: string) => `${resourceBase}/${path}`
/** A separate dev page may inspect candidates without replacing the production registry. */
export function configureCharacterPreview(digest: string) {
  if (!import.meta.env.DEV || window.location.pathname !== '/character-lab.html' || !/^[a-f0-9]{64}$/.test(digest)) throw new Error('Invalid development preview')
  if (registryPromise) throw new Error('Configure the candidate before loading character resources')
  resourceBase = `/.character-preview/${digest}`
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
async function loadPack(id: string): Promise<CharacterPack> {
  const registry = await loadCharacterRegistry()
  const entry = registry.characters.find(character => character.id === id)
  if (!entry) throw new Error(`Unknown character resource pack: ${id}`)
  const url = `${resourceBase}/${entry.manifest}`
  const manifest = CharacterManifestSchema.parse(await readJson(url))
  if (manifest.id !== id) throw new Error(`Character manifest ID mismatch: ${id}`)
  const pageUrls = manifest.pages.map(page => `${url.slice(0, url.lastIndexOf('/') + 1)}${page.image}`)
  const pack = new CharacterPackResources(manifest, pageUrls)
  try {
    await pack.ensureStartup()
    return pack
  } catch (error) { await pack.dispose(); throw error }
}
export const characterAssets = new ResourceLeaseCache(loadPack)
export const getCharacterPack = (id: string) => characterAssets.get(id)
export const supportsCharacterPose: PoseSupport = (id, posture, facing) => {
  const pack = getCharacterPack(id)
  return pack ? Boolean(resolveCharacterClip(pack.manifest, characterPoseClip(posture, facing))) : supportsOfficePose(id, posture, facing)
}
export function isApartmentReady(id?: string): boolean {
  return id ? Boolean(getCharacterPack(id)) : AGENT_ROSTER.every(agent => getCharacterPack(agent.id))
}
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
export async function loadApartmentAssets(ids = AGENT_ROSTER.map(agent => agent.id), onLoaded?: (id: string) => void, options?: CharacterLoadOptions) {
  try { return await acquireCharacterPacks(ids, onLoaded, options) }
  catch (error) { console.error('[Characters] 人物资源包加载失败，使用占位人物', error); return undefined }
}
