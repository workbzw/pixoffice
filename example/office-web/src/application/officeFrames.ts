import { readCharacterManifest } from '@pixoffice/assets-office/frame/resources'
import { bindOfficeFrames } from '@pixoffice/assets-office/frame/bindings'
export { bindOfficeFrames }

export async function resolveOfficeAppearance(id: string, options: { energeticWork?: boolean } = {}) {
  const { manifest, url } = await readCharacterManifest(id)
  const appearance = bindOfficeFrames(manifest, url)
  if (!options.energeticWork) return appearance
  const variantId = 'office.type.seated.back', binding = appearance.source.bindings[variantId]
  if (!binding || !manifest.clips['work.typing-back']) throw new Error(`Missing crafting work frames: ${id}`)
  return { ...appearance, source: { ...appearance.source, bindings: { ...appearance.source.bindings,
    [variantId]: { ...binding, clip: 'work.typing-back' } } } }
}
