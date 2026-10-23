import type { CharacterPack } from '@pixoffice/assets-office/frame/resources'
import { useEffect, useState, type CSSProperties } from 'react'
import { sampleCharacterLayers, type CharacterManifest } from '@pixoffice/assets-office/frame/packSchema'
import { characterResourceUrl, loadCharacterRegistry } from '@pixoffice/assets-office/frame/resources'
import type { CharacterRegistry } from '@pixoffice/assets-office/frame/packSchema'

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

export function CharacterAvatar({ appearanceId, height = 32, crop = 'full' }: { appearanceId?: string; height?: number; crop?: 'full' | 'head' }) {
  const [entry, setEntry] = useState<CharacterRegistry['characters'][number]>()
  useEffect(() => {
    let active = true
    if (!appearanceId) return
    void loadCharacterRegistry().then(registry => {
      if (active) setEntry(registry.characters.find(character => character.id === appearanceId))
    }).catch(() => { /* The scene reports resource failures; avatars remain empty. */ })
    return () => { active = false }
  }, [appearanceId])
  const portrait = entry?.id === appearanceId ? entry?.portrait : undefined
  // Crop the head from the registered front portrait without publishing another image.
  const scale = portrait ? height / (portrait.referenceHeight * (crop === 'head' ? .6 : 1)) : 1
  return <span className="runtime-avatar" style={crop === 'head' ? { position: 'relative', width: height, height, flexShrink: 0 } : undefined}>{portrait ? <img alt={entry!.label} draggable={false} decoding="async"
    src={characterResourceUrl(`${appearanceId}/${portrait.image}`)}
    style={{ width: portrait.canvas.width * scale, height: portrait.canvas.height * scale,
      ...(crop === 'head' ? { position: 'absolute', maxHeight: 'none', left: '50%', top: -portrait.canvas.height * scale * .15, transform: 'translateX(-50%)' } : {}) }} />
    : null}</span>
}
