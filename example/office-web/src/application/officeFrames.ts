import { readCharacterManifest } from '@pixoffice/animation-frame/resources'
import { bindOfficeFrames } from '../../../../assets/office/frameBindings.ts'
export { bindOfficeFrames }

export async function resolveOfficeAppearance(id: string) {
  const { manifest, url } = await readCharacterManifest(id)
  return bindOfficeFrames(manifest, url)
}
