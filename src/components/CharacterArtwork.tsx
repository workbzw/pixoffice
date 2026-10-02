import type { CharacterPack } from '@/scene/assets/loadApartmentAssets'
import { useEffect, useState, type CSSProperties } from 'react'
import { sampleCharacterLayers, type CharacterManifest } from '@/scene/characters/packSchema'
import { useCharacterPack } from './useCharacterPack'
import { characterResourceUrl, loadCharacterRegistry } from '@/scene/assets/loadApartmentAssets'
import type { CharacterRegistry } from '@/scene/characters/packSchema'

export function CharacterArtwork({ pack, clip, elapsedMs = 0, height = 160, guides = false, label = '' }: {
  pack: CharacterPack; clip: string; elapsedMs?: number; height?: number; guides?: boolean; label?: string
}) {
  const layers = sampleCharacterLayers(pack.manifest, clip, elapsedMs)
  if (!layers) return <span role="status">未提供此动作</span>
  const { body: sample, mouth, work } = layers
  const { canvas, pivot, referenceHeight, pages } = pack.manifest
  const scale = height / referenceHeight
  const frameStyle = (frame: CharacterManifest['frames'][string]): CSSProperties => ({
    display: 'block', position: 'absolute', left: frame.offset.x * scale, top: frame.offset.y * scale,
    width: frame.rect.width * scale, height: frame.rect.height * scale,
    backgroundImage: `url("${pack.pageUrls[frame.page]}")`, backgroundRepeat: 'no-repeat',
    backgroundPosition: `${-frame.rect.x * scale}px ${-frame.rect.y * scale}px`,
    backgroundSize: `${pages[frame.page].width * scale}px ${pages[frame.page].height * scale}px`,
  })
  return <span className="character-artwork" role="img" aria-label={label || clip} style={{
    display: 'block', position: 'relative', width: canvas.width * scale, height: canvas.height * scale,
  }}>
    {work?.parts.map((part, index) => <span key={index} style={{ position: 'absolute', inset: 0, transformOrigin: '0 0',
      transform: `translate(${part.position.x * scale}px, ${part.position.y * scale}px) rotate(${part.rotation}rad) scale(${part.mirror}, 1) translate(${-part.root.x * scale}px, ${-part.root.y * scale}px)` }}>
      <span style={frameStyle(part.frame)} />
    </span>)}
    <span style={{ position: 'absolute', inset: 0, transform: sample.clip.mirrorX ? 'scaleX(-1)' : undefined,
      transformOrigin: `${pivot.x * scale}px ${pivot.y * scale}px` }}>
      <span style={frameStyle(sample.frame)} />
      {mouth && <span style={{ position: 'absolute', inset: 0, transformOrigin: '0 0',
        transform: `translate(${mouth.attachment.x * scale}px, ${mouth.attachment.y * scale}px) rotate(${mouth.attachment.rotation}deg) scale(${mouth.attachment.scale * (mouth.clip.mirrorX ? -1 : 1)}, ${mouth.attachment.scale}) translate(${-mouth.pivot.x * scale}px, ${-mouth.pivot.y * scale}px)` }}>
        <span style={frameStyle(mouth.frame)} />
      </span>}
    </span>
    {guides && <><span className="character-ground-guide" style={{ top: pivot.y * scale }} /><span className="character-pivot-guide" style={{ left: pivot.x * scale, top: pivot.y * scale }} /></>}
  </span>
}

export function CharacterAvatar({ id }: { id: string }) {
  const [entry, setEntry] = useState<CharacterRegistry['characters'][number]>()
  useEffect(() => {
    let active = true
    void loadCharacterRegistry().then(registry => {
      if (active) setEntry(registry.characters.find(character => character.id === id))
    }).catch(() => { /* The scene reports resource failures; avatars remain empty. */ })
    return () => { active = false }
  }, [id])
  const portrait = entry?.id === id ? entry.portrait : undefined
  return <span className="runtime-avatar">{portrait ? <img alt={entry!.label} draggable={false} decoding="async"
    src={characterResourceUrl(`${id}/${portrait.image}`)}
    style={{ width: portrait.canvas.width * 32 / portrait.referenceHeight, height: portrait.canvas.height * 32 / portrait.referenceHeight }} />
    : entry?.id === id && <LegacyCharacterAvatar id={id} />}</span>
}

function LegacyCharacterAvatar({ id }: { id: string }) {
  const { pack } = useCharacterPack(id)
  return pack && <CharacterArtwork pack={pack} clip={pack.manifest.portrait} height={32} label={pack.manifest.label} />
}
