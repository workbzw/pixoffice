import type { Agent, AgentState } from '@/types/agent'
import type { OfficeRuntime } from '../OfficeRuntime'
import type { SceneCommand } from '../protocol'
import type { World } from '../model'
import { actorVisualPose, cellCenter, seatPixels } from '@/scene/gridProjection'

export function commandBase(runtime: OfficeRuntime) {
  return { protocolVersion: '2.0' as const, sceneId: runtime.sceneId, commandId: `cmd-${globalThis.crypto.randomUUID()}` }
}
export function visitCommand(runtime: OfficeRuntime, visitorNo: number, hostNos: number[], message: (no: number, name: string) => string): SceneCommand {
  const actors = runtime.readActors(), visitor = actors[visitorNo - 1]
  if (!visitor) throw new Error('访客不存在')
  const stops = hostNos.map(no => {
    const host = actors[no - 1]
    if (!host) throw new Error('接待人不存在')
    return { hostId: host.id, message: message(no, host.name) }
  })
  return { ...commandBase(runtime), type: 'activity.start', capability: 'office.visit',
    participants: [{ entityId: visitor.id, role: 'visitor' }, ...[...new Set(stops.map(s => s.hostId))].map(entityId => ({ entityId, role: 'host' }))], params: { stops } }
}
export function presentationCommand(runtime: OfficeRuntime, id: string, state: AgentState, task?: string): SceneCommand {
  const actor = runtime.readActors().find(a => a.id === id)
  if (!actor) throw new Error('人物不存在')
  return { ...commandBase(runtime), type: 'actor.presentation.set', actorId: id,
    status: state === 'working' || state === 'thinking' ? state : 'idle', title: task ?? '', sourceRevision: actor.presentation.sourceRevision + 1 }
}
export function projectAgents(runtime: OfficeRuntime, includeMissions = true, preview?: World): Agent[] {
  const snapshot = includeMissions ? runtime.snapshot() : undefined
  // Read active phases without copying the full command/event history on every render tick.
  const focused = new Map((preview ? [] : runtime.readActivePhases())
    .filter(phase => phase.capability === 'office.focus' && phase.ready && phase.phaseIndex === phase.phaseCount - 1)
    .flatMap(phase => phase.participants.map(id => [id, phase.title] as const)))
  return (preview?.actors ?? snapshot?.world.actors ?? runtime.readActors()).map(actor => {
    const transition = actor.seatTransition
    const stepping = transition && ['entering', 'exiting'].includes(transition.stage)
    const next = actor.step?.to ?? (stepping ? transition.target : actor.motion?.path[actor.motion.index])
    const { position, facing } = actorVisualPose(actor), nextPixel = next && cellCenter(next)
    const agent: Agent = { id: actor.id, appearanceId: actor.templateId, name: actor.name, color: actor.color, x: position.x, y: position.y,
      targetX: nextPixel?.x, targetY: nextPixel?.y, assignedDeskId: actor.homeId, seated: actor.posture === 'seated',
      seatTransition: transition ? { ...transition, seat: transition.interactionId === 'seat' ? seatPixels(transition.seat) : cellCenter(transition.seat), approach: cellCenter(transition.approach), passage: transition.passage.map(cellCenter), target: transition.target && cellCenter(transition.target) } : undefined,
      facing: facing === 'left' ? -1 : 1, viewFacing: facing, customAnimation: actor.expression,
      bubbleText: actor.speech?.text, currentTask: focused.get(actor.id) ?? actor.presentation.title,
      state: transition ? stepping && !transition.waiting ? 'walking' : 'idle' : actor.step || actor.motion && !actor.motion.waiting ? 'walking' : actor.expression || actor.speech ? 'talking' : actor.posture === 'seated' ? focused.has(actor.id) ? 'working' : actor.presentation.status : 'idle' }
    // Only the legacy HTTP queue consumes this projection; the runtime has no missions.
    const activity = snapshot?.activities.find(a => a.status === 'active' && a.capability === 'office.visit' && a.participants[0] === actor.id)
    if (activity && snapshot) {
      const record = snapshot.records.find(r => r.command.commandId === activity.commandId)
      if (record?.command.type === 'activity.start') {
        const stops = record.command.params.stops as { hostId: string; message: string }[]
        // A visit can include listening, replies and seat transitions, not a fixed phase count.
        const visitorMoves = activity.plan.phases.slice(0, activity.phaseIndex + 1).flatMap(phase => phase.moves?.filter(move => move.actorId === actor.id) ?? [])
        const approaches = visitorMoves.filter(move => stops.some(stop => snapshot.world.actors.find(a => a.id === stop.hostId)?.homeId === move.targetId))
        const index = Math.min(stops.length - 1, Math.max(0, approaches.length - 1))
        const host = snapshot.world.actors.find(a => a.id === stops[index].hostId)!
        const returning = visitorMoves.at(-1)?.targetId === actor.homeId
        const approaching = activity.plan.phases[activity.phaseIndex]?.moves?.some(move => move.actorId === actor.id)
        agent.mission = { kind: 'desk_visit', phase: returning ? 'return' : approaching ? 'goto' : 'talk', hostAgentId: host.id, hostDeskId: host.homeId!,
          message: stops[index].message, resumeTask: actor.presentation.title, talkDuration: 3,
          queue: stops.slice(index + 1).map(s => { const a = snapshot.world.actors.find(v => v.id === s.hostId)!; return { hostAgentId: a.id, hostDeskId: a.homeId!, hostRosterNo: snapshot.world.actors.indexOf(a) + 1, message: s.message } }) }
      }
    }
    return agent
  })
}
