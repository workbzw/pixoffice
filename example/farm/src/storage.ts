import type { Persistence } from '@pixoffice/runtime'
import type { FarmClock } from '@pixoffice/scene-farm'
import { createFarmWorld, inventoryStateSchema, plotStateSchema } from '@pixoffice/scene-farm'
export const farmStorageKey = 'pixoffice:farm:v1'
export const farmLegacyBackupKey = `${farmStorageKey}:layout-v1-backup`
export function readFarmSave() {
  try {
    const raw = localStorage.getItem(farmStorageKey)
    if (!raw) return { clockMs: 0, checkpoint: null, error: '' }
    const save = JSON.parse(raw)
    if (![1, 2].includes(save.version) || save.layoutVersion !== undefined && ![1, 2].includes(save.layoutVersion)
      || !Number.isFinite(save.clockMs) || save.clockMs < 0 || !save.checkpoint) throw new Error('不兼容的农场存档')
    const world = save.checkpoint.world, expected = createFarmWorld()
    for (const kind of ['actors', 'props'] as const) {
      const entries = world?.[kind] as Array<{ id: string; templateId: string }> | undefined
      if (!Array.isArray(entries) || entries.length !== expected[kind].length || new Set(entries.map(p => p.id)).size !== entries.length
        || expected[kind].some(p => !entries.some(saved => saved.id === p.id && saved.templateId === p.templateId))) throw new Error('农场人物或菜地不完整')
    }
    for (const prop of world.props) (prop.templateId === 'farm.plot' ? plotStateSchema : inventoryStateSchema).parse(prop.state)
    if (save.layoutVersion !== 2) {
      if (!Number.isSafeInteger(world.layoutRevision) || world.layoutRevision < 0) throw new Error('农场布局版本无效')
      // Only positions change; crop state, inventory and command history stay intact.
      for (const kind of ['actors', 'props'] as const) for (const entry of world[kind]) {
        entry.position = { ...expected[kind].find(item => item.id === entry.id)!.position }
      }
      world.layoutRevision++
    }
    return { clockMs: save.clockMs as number, checkpoint: save.checkpoint as unknown, error: '' }
  } catch (reason) { return { clockMs: 0, checkpoint: null, error: `农场存档未覆盖：${reason instanceof Error ? reason.message : String(reason)}` } }
}
export function farmPersistence(clock: FarmClock, checkpoint: unknown): Persistence {
  let checkedLegacy = false
  return { load: () => checkpoint, save(value) {
    if (!checkedLegacy) {
      const previous = localStorage.getItem(farmStorageKey)
      if (previous && JSON.parse(previous).layoutVersion !== 2 && !localStorage.getItem(farmLegacyBackupKey)) localStorage.setItem(farmLegacyBackupKey, previous)
      checkedLegacy = true
    }
    localStorage.setItem(farmStorageKey, JSON.stringify({ version: 2, layoutVersion: 2, clockMs: clock.now(), checkpoint: value }))
  } }
}
