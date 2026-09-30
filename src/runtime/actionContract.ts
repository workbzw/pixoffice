import type { Actor, Facing, Point, Pose, World } from './model'
import { facingToward } from './model'
import { SceneFault } from './protocol'

export type PoseSupport = (templateId: string, posture: Actor['posture'], facing: Facing) => boolean
export const unrestrictedPoses: PoseSupport = () => true

export function resolvePoses(world: World, poses: Pose[], supports: PoseSupport, positions = new Map<string, Point>()) {
  const actor = (id: string) => {
    const found = world.actors.find(a => a.id === id)
    if (!found) throw new SceneFault('ENTITY_NOT_FOUND', id)
    return found
  }
  return poses.map(pose => {
    const subject = actor(pose.actorId), posture = pose.posture ?? subject.posture
    const position = positions.get(subject.id) ?? subject.position
    const target = pose.lookAt ? actor(pose.lookAt) : undefined
    const facing = target ? facingToward(position, positions.get(target.id) ?? target.position) : pose.facing ?? subject.facing
    if (!supports(subject.templateId, posture, facing)) {
      throw new SceneFault('UNSUPPORTED_POSE', `${subject.name}缺少 ${posture}.${facing} 动作，无法在这个位置完成交互`)
    }
    return { actor: subject, posture, facing, expression: pose.expression }
  })
}
