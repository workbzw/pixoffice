import { createCharacterResources } from '@pixoffice/animation-frame/resources'
import type { CharacterPackResources as FrameResources } from '@pixoffice/animation-frame/CharacterPackResources'
import { CharacterManifestSchema, characterFrameDependencies, type CharacterManifest } from './packSchema.ts'

export type CharacterPackResources = FrameResources<CharacterManifest>
export type CharacterPack = CharacterPackResources
export const { configureCharacterResources, characterResourceUrl, loadCharacterRegistry, readCharacterManifest, characterAssets, getCharacterPack, acquireCharacterPacks } = createCharacterResources({
  parseManifest: data => CharacterManifestSchema.parse(data), dependencies: characterFrameDependencies, cacheData: import.meta.hot?.data,
})
