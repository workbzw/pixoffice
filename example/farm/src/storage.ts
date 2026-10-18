import type { Persistence } from '@pixoffice/runtime'
import type { FarmClock } from '@pixoffice/scene-farm'
import { createFarmWorld, inventoryStateSchema, plotStateSchema } from '@pixoffice/scene-farm'
import { jsonObjectSchema, parseProtocolObject, stringifyDocumentObject } from '@pixoffice/protocol/schema'
export const farmStorageKey = 'pixoffice:farm:v3'
export function readFarmSave() {
  try {
    const raw = localStorage.getItem(farmStorageKey)
    if (!raw) return { clockMs: 0, checkpoint: undefined, error: '' }
    const save = parseProtocolObject(raw)
    if (save.version !== 3 || save.layoutVersion !== 2
      || typeof save.clockMs !== 'number' || !Number.isFinite(save.clockMs) || save.clockMs < 0 || !save.checkpoint) throw new Error('不兼容的农场存档')
    const checkpoint = jsonObjectSchema.parse(save.checkpoint)
    const world = jsonObjectSchema.parse(checkpoint.world), expected = createFarmWorld()
    for (const kind of ['actors', 'props'] as const) {
      const entries = world?.[kind] as Array<{ id: string; templateId: string }> | undefined
      if (!Array.isArray(entries) || entries.length !== expected[kind].length || new Set(entries.map(p => p.id)).size !== entries.length
        || expected[kind].some(p => !entries.some(saved => saved.id === p.id && saved.templateId === p.templateId))) throw new Error('农场人物或菜地不完整')
    }
    for (const prop of world.props as Array<{ templateId: string; state: unknown }>) (prop.templateId === 'farm.plot' ? plotStateSchema : inventoryStateSchema).parse(prop.state)
    return { clockMs: save.clockMs, checkpoint, error: '' }
  } catch (reason) { return { clockMs: 0, checkpoint: undefined, error: `农场存档未覆盖：${reason instanceof Error ? reason.message : String(reason)}` } }
}
export function farmPersistence(clock: FarmClock, checkpoint: unknown): Persistence {
  return { load: () => checkpoint === undefined ? undefined : parseProtocolObject(stringifyDocumentObject(checkpoint)), save(value) {
    localStorage.setItem(farmStorageKey, stringifyDocumentObject({ version: 3, layoutVersion: 2, clockMs: clock.now(), checkpoint: value }))
  } }
}
