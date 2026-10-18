import type { SceneRuntime } from '@pixoffice/runtime/SceneRuntime'
import { commandBase } from '@pixoffice/scene-office/adapters/office'
import { SceneFault } from '@pixoffice/protocol'
import { stringifyDocumentObject } from '@pixoffice/protocol/schema'
import type { MapEdit, MapOperation, MapDocument } from '@pixoffice/protocol/map'
import type { MapDraftSnapshot } from '@pixoffice/runtime/map/MapDraft'
import type { Dispatch, SetStateAction } from 'react'

export type MapFurniture = MapDocument['props'][number]
export type MapView = { tool: 'select' | 'route'; selection: string; catalogOpen: boolean; placing?: MapFurniture }
export const initialMapView: MapView = { tool: 'select', selection: '', catalogOpen: true }
export type EditorProps = { runtime: SceneRuntime; draft: MapDraftSnapshot; view: MapView; setView: Dispatch<SetStateAction<MapView>>; onError: (message: string | null) => void }
export type MapAction = Exclude<MapEdit, { action: 'begin' }> extends infer E ? E extends MapEdit ? Omit<E, 'draftId' | 'expectedDraftRevision'> : never : never
export function editMap(runtime: SceneRuntime, action: MapAction, reference = runtime.editorSnapshot()) {
  if (!reference) throw new SceneFault('DRAFT_NOT_FOUND', '地图草稿已关闭')
  const result = runtime.submit({ ...commandBase(runtime), type: 'map.edit', edit: { ...action, draftId: reference.id, expectedDraftRevision: reference.revision } })
  if (result.error) throw new SceneFault(result.error.code, result.error.message)
  return result
}
export const patchMap = (runtime: SceneRuntime, operations: MapOperation[]) => editMap(runtime, { action: 'patch', operations })
export function downloadMap(runtime: SceneRuntime) {
  const document = runtime.editorSnapshot()?.document ?? runtime.exportMap()
  const url = URL.createObjectURL(new Blob([stringifyDocumentObject(document, 2)], { type: 'application/json' }))
  const a = window.document.createElement('a'); a.href = url; a.download = `${document.sceneId}.map.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
