import assert from 'node:assert/strict'

export function beginMapEdit(runtime, commandId, expectedLayoutRevision = runtime.readWorld().layoutRevision) {
  return runtime.submit({ protocolVersion: '2.0', sceneId: runtime.sceneId, commandId, type: 'map.edit',
    edit: { action: 'begin', expectedLayoutRevision } })
}

export function editMapDraft(runtime, commandId, action, reference = runtime.editorSnapshot()) {
  assert(reference, 'A map draft must be open')
  return runtime.submit({ protocolVersion: '2.0', sceneId: runtime.sceneId, commandId, type: 'map.edit',
    edit: { ...action, draftId: reference.id, expectedDraftRevision: reference.revision } })
}
