import { readCharacterManifest } from '@pixoffice/assets-office/frame/resources'
import { bindOfficeFrames } from '@pixoffice/assets-office/frame/bindings'
export { bindOfficeFrames }

export async function resolveOfficeAppearance(id: string) {
  const { manifest, url } = await readCharacterManifest(id)
  return bindOfficeFrames(manifest, url)
}
