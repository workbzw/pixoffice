import type { Texture } from 'pixi.js'
import { loadOfficeTexture } from './loadOfficeTexture.ts'

const textures = new Map<string, Texture>()
export const getReferenceOfficeTexture = (name: string) => textures.get(name)
export const loadReferenceOfficeBackground = () => loadOfficeTexture('office-reference-room-whiteboard-v3', 'reference-v1/room-whiteboard-v3', true)
export async function loadReferenceOfficeObjects(report: (part: string) => void) {
  await Promise.all(['conference-table', 'desk-accessories'].map(async name => {
    textures.set(name, await loadOfficeTexture(`office-reference-${name}`, `reference-v1/${name}`))
    report(name)
  }))
}
