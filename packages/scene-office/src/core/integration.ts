import type { SceneRuntime } from '@pixoffice/runtime/SceneRuntime'
import { officeSceneSchema } from '@pixoffice/protocol/office-integration'

export function describeOfficeScene(runtime: SceneRuntime) {
  const description = runtime.describe(), world = runtime.readWorld()
  const states = Object.assign({}, ...description.plugins.map(plugin => plugin.stateSchemas))
  return officeSceneSchema.parse({ protocolVersion: '2.0', sceneId: runtime.sceneId, command: description.command, batch: description.batch,
    actors: world.actors.map(({ id, name, templateId, position, presentation }) => ({ id, name, templateId, position, presentation })),
    objects: world.props.map(({ id, name, templateId, state, stateRevision }) => ({ id, name, templateId, state, stateRevision, stateSchema: states[templateId] ?? {},
      interactions: Object.entries(runtime.template(templateId).interactions ?? {}).map(([interactionId, interaction]) => ({
        id: interactionId, name: interaction.name, requiresHome: interaction.requiresHome === true,
        actorIds: world.actors.filter(actor => !interaction.requiresHome || actor.homeId === id).map(actor => actor.id),
      })) })),
    capabilities: description.plugins.flatMap(plugin => plugin.operations),
  })
}
