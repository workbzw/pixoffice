import type { SceneRuntime } from './SceneRuntime.ts'

/** Read access for presentation. Mutation and the simulation clock belong to the host. */
export type SceneReadPort = Pick<SceneRuntime,
  'sceneId' | 'readWorld' | 'readActors' | 'readActivePhases' | 'snapshot' |
  'isEditing' | 'readEditorWorld' | 'editorSnapshot' | 'template' | 'templates' |
  'subscribe' | 'getRevision'> & {
    readonly navigation: Pick<SceneRuntime['navigation'], 'anchor'>
  }
