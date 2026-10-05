import { createRoot } from 'react-dom/client'
import { configureCharacterResources, loadCharacterRegistry } from '../scene/assets/loadApartmentAssets.ts'
import { CharacterLab } from './CharacterLab.tsx'

async function start() {
  const digest = new URLSearchParams(location.search).get('candidate') ?? ''
  if (!import.meta.env.DEV || !/^[a-f0-9]{64}$/.test(digest)) throw new Error('Invalid development preview')
  configureCharacterResources(`/.character-preview/${digest}`)
  const registry = await loadCharacterRegistry()
  const entry = registry.characters[0]
  if (!entry) throw new Error('候选素材不存在')
  createRoot(document.getElementById('root')!).render(<CharacterLab id={entry.id} label={entry.label} />)
}
void start().catch(error => { document.getElementById('root')!.textContent = String(error) })
