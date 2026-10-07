import { CharacterSourceSchema, CharacterManifestSchema, characterFrameDependencies, sampleCharacterLayers } from '@pixoffice/assets-office/frame/packSchema'
import { assertCharacterAdmission } from '../../scripts/characters/quality.mjs'
export const officeFrameBuildProfile = {
  sourceSchema: CharacterSourceSchema, manifestSchema: CharacterManifestSchema,
  dependencies: characterFrameDependencies,
  sampleLayers: (...args) => {
    const layers = sampleCharacterLayers(...args)
    return { ...layers, overlays: layers?.work?.parts }
  },
  startupClips: source => source.profile === 'office' ? ['sit.back', 'work.quiet-back'] : [source.portrait],
  admit: assertCharacterAdmission,
}
