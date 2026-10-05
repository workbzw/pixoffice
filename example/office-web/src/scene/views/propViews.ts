import { createOfficePropViews as createViews } from '@pixoffice/scene-office/pixi/views'
import type { Agent } from '@pixoffice/scene-office/types'
export { PropViewRegistry } from '@pixoffice/renderer-pixi/PropViewRegistry'
export type { PropView, PropViewFactory } from '@pixoffice/renderer-pixi/PropViewRegistry'

export function createOfficePropViews(trialEnabled?: () => boolean) {
  const registry = createViews(trialEnabled)
  const create = registry.create.bind(registry)
  return Object.assign(registry, { create: (...args: Parameters<typeof create>) => {
    const view = create(...args), update = view.update.bind(view)
    return Object.assign(view, { update: (prop: Parameters<typeof update>[0], template: Parameters<typeof update>[1], actors: Agent[]) =>
      update(prop, template, actors.map(actor => ({ id: actor.id, furniture: actor.assignedDeskId ? { propId: actor.assignedDeskId, seated: Boolean(actor.seated), transitioning: Boolean(actor.seatTransition) } : undefined })) as Parameters<typeof update>[2]) })
  } })
}
