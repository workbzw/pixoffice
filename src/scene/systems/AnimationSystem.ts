import type { AgentEntity } from '@/scene/entities/AgentEntity'

/** Update character state and sprite frames; Spine advances its own skeleton. */
export class AnimationSystem {
  update(entities: Map<string, AgentEntity>, dt: number) {
    for (const entity of entities.values()) {
      entity.updateVisuals(entity.data.state, dt)
    }
  }
}
