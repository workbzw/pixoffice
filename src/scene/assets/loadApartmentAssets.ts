import { Assets, Rectangle, Texture } from 'pixi.js'
import { AGENT_ROSTER } from '@/scene/layout/officeLayout'
import { CharacterManifestSchema, CharacterRegistrySchema, resolveCharacterClip, type CharacterManifest, type CharacterRegistry } from '@/scene/characters/packSchema'
import { ResourceLeaseCache } from './ResourceLeaseCache'
import { characterPoseClip, supportsOfficePose } from '@/contracts/characterPose'
import type { PoseSupport } from '@/runtime/actionContract'

export type CharacterPack = {
  manifest: CharacterManifest
  pageUrls: string[]
  textures: Map<string, Texture>
  dispose(): Promise<void>
}
let registryPromise: Promise<CharacterRegistry> | undefined
let resourceBase = '/characters'
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
  const pages: Texture[] = [], textures = new Map<string, Texture>()
  const dispose = async () => {
    for (const texture of textures.values()) texture.destroy()
    textures.clear()
    for (const pageUrl of pageUrls.slice(0, pages.length)) await Assets.unload(pageUrl)
  }
  try {
    for (const [index, pageUrl] of pageUrls.entries()) {
      const texture = await Assets.load<Texture>(pageUrl)
      pages.push(texture)
      const expected = manifest.pages[index]
      if (texture.width !== expected.width || texture.height !== expected.height) throw new Error(`Character atlas dimensions mismatch: ${pageUrl}`)
    }
    for (const [name, frame] of Object.entries(manifest.frames)) textures.set(name, new Texture({
      source: pages[frame.page].source,
      frame: new Rectangle(frame.rect.x, frame.rect.y, frame.rect.width, frame.rect.height),
      orig: new Rectangle(0, 0, manifest.canvas.width, manifest.canvas.height),
      trim: new Rectangle(frame.offset.x, frame.offset.y, frame.rect.width, frame.rect.height),
    }))
    return { manifest, pageUrls, textures, dispose }
  } catch (error) { await dispose(); throw error }
}
export const characterAssets = new ResourceLeaseCache(loadPack)
export const getCharacterPack = (id: string) => characterAssets.get(id)
export const supportsCharacterPose: PoseSupport = (id, posture, facing) => {
  const pack = getCharacterPack(id)
  return pack ? Boolean(resolveCharacterClip(pack.manifest, characterPoseClip(posture, facing))) : supportsOfficePose(id, posture, facing)
}
export function usesApartmentCharacters(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('characters') !== 'classic'
}
export function isApartmentReady(id?: string): boolean {
  return id ? Boolean(getCharacterPack(id)) : AGENT_ROSTER.every(agent => getCharacterPack(agent.id))
}
export async function acquireCharacterPacks(ids: string[]) {
  const leases: Array<Awaited<ReturnType<typeof characterAssets.acquire>>> = []
  try {
    for (const id of new Set(ids)) leases.push(await characterAssets.acquire(id))
    return { packs: leases.map(lease => lease.value), release: () => leases.forEach(lease => lease.release()) }
  } catch (error) { leases.forEach(lease => lease.release()); throw error }
}
export async function loadApartmentAssets(ids = AGENT_ROSTER.map(agent => agent.id)) {
  try { return await acquireCharacterPacks(ids) }
  catch (error) { console.error('[Characters] 人物资源包加载失败，回退原人物素材', error); return undefined }
}
