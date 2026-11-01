import type { Texture } from 'pixi.js'
import { loadOfficeTexture } from './loadOfficeTexture.ts'

const textures = new Map<string, Texture>()
export const getReferenceOfficeTexture = (name: string) => textures.get(name)
export const loadReferenceOfficeBackground = () => loadOfficeTexture('office-reference-room-whiteboard-v4-aligned', 'reference-v1/room-whiteboard-v4', true)
export const loadPanoramaOfficeBackground = () => loadOfficeTexture('office-reference-room-workplace-v1', 'reference-v1/room-workplace-v1', true)
export async function loadAdaptiveWhiteboard() {
  textures.set('whiteboard-adaptive-v1', await loadOfficeTexture('office-reference-whiteboard-adaptive-v1', 'reference-v1/whiteboard-adaptive-v1'))
}
export async function loadReferenceOfficeObjects(report: (part: string) => void) {
  await Promise.all(['conference-table', 'desk-accessories'].map(async name => {
    textures.set(name, await loadOfficeTexture(`office-reference-${name}`, `reference-v1/${name}`))
    report(name)
  }))
}
