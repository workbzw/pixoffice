import type { AgentEntity } from '@/scene/entities/AgentEntity'

/** Update character state and picture-frame animation. */
export class AnimationSystem {
  update(entities: Map<string, AgentEntity>, dt: number) {
    for (const entity of entities.values()) {
      entity.updateVisuals(entity.data.state, dt)
    }
  }
}
