import { useEffect, useState } from 'react'
import { characterAssets, getCharacterPack, type CharacterPack } from '../scene/assets/loadApartmentAssets.ts'

export function useCharacterPack(id: string | undefined, enabled = true) {
  const [pack, setPack] = useState<CharacterPack | undefined>(() => {
    const cached = id ? getCharacterPack(id) : undefined
    return cached?.isComplete ? cached : undefined
  })
  const [error, setError] = useState('')
  useEffect(() => {
    if (!id || !enabled) return
    let active = true, release: (() => void) | undefined
    setError('')
    void characterAssets.acquire(id).then(async lease => {
      if (!active) { lease.release(); return }
      release = lease.release
      await lease.value.ensureAll()
      if (active) setPack(lease.value)
    }).catch(reason => { release?.(); if (active) setError(reason instanceof Error ? reason.message : '人物加载失败') })
    return () => { active = false; release?.() }
  }, [id, enabled])
  return { pack: enabled && pack?.manifest.id === id ? pack : undefined, error }
}
