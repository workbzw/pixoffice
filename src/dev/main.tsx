import { createRoot } from 'react-dom/client'
import { configureCharacterPreview, loadCharacterRegistry } from '@/scene/assets/loadApartmentAssets'
import { CharacterLab } from './CharacterLab'

async function start() {
  configureCharacterPreview(new URLSearchParams(location.search).get('candidate') ?? '')
  const registry = await loadCharacterRegistry()
  const entry = registry.characters[0]
  if (!entry) throw new Error('候选素材不存在')
  createRoot(document.getElementById('root')!).render(<CharacterLab id={entry.id} label={entry.label} />)
}
void start().catch(error => { document.getElementById('root')!.textContent = String(error) })
