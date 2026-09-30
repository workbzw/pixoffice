import { useEffect, useState } from 'react'
import { characterAssets, getCharacterPack, type CharacterPack } from '@/scene/assets/loadApartmentAssets'

export function useCharacterPack(id: string | undefined, enabled = true) {
  const [pack, setPack] = useState<CharacterPack | undefined>(() => id ? getCharacterPack(id) : undefined)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!id || !enabled) return
    let active = true, release: (() => void) | undefined
    setError('')
    void characterAssets.acquire(id).then(lease => {
      if (!active) { lease.release(); return }
      release = lease.release
      setPack(lease.value)
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '人物加载失败') })
    return () => { active = false; release?.() }
  }, [id, enabled])
  return { pack: enabled && pack?.manifest.id === id ? pack : undefined, error }
}
