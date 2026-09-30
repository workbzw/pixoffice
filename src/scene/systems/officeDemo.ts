import type { OfficeRuntime } from '@/runtime/OfficeRuntime'
import type { Actor } from '@/runtime/model'
import type { SceneCommand } from '@/runtime/protocol'
import { commandBase } from '@/runtime/adapters/legacy'

const topics = [
  ['我们核对一下这轮的数据。', '好，我补充异常项，整理后再找你确认。'],
  ['这份方案请帮我看看。', '收到，我检查细节后把意见带过去。'],
  ['下一步的任务我们对齐一下。', '可以，我先处理手上的部分，再和你同步。'],
  ['刚整理的资料，交给你继续跟进。', '收到，我会核对来源并补全缺失信息。'],
  ['结果已准备好，来和你确认交付。', '我看到了，稍后反馈复核结果。'],
]

export function demoPairs(actors: Actor[], round: number): [Actor, Actor][] {
  const roster: (Actor | undefined)[] = actors.filter(actor => actor.homeId)
  if (roster.length < 2) return []
  if (roster.length % 2) roster.push(undefined)
  // Round-robin pairs never share a participant; the next round reverses each visit.
  const rotations = Math.floor(round / 2) % (roster.length - 1)
  for (let i = 0; i < rotations; i++) roster.splice(1, 0, roster.pop())
  const pairs: [Actor, Actor][] = []
  for (let i = 0; i < roster.length / 2; i++) {
    const a = roster[i], b = roster[roster.length - 1 - i]
    if (a && b) pairs.push((round + i) % 2 ? [b, a] : [a, b])
  }
  return pairs
}

export function demoCommands(runtime: OfficeRuntime, round: number): SceneCommand[] {
  return demoPairs(runtime.readActors(), round).map(([visitor, host], index) => {
    const [message, reply] = topics[(Math.floor(round / 2) + index) % topics.length]
    return {
      ...commandBase(runtime), type: 'activity.start', capability: 'office.visit',
      participants: [{ entityId: visitor.id, role: 'visitor' }, { entityId: host.id, role: 'host' }],
      params: { durationMs: 2200 + index * 400, stops: [{ hostId: host.id, message: `${host.name}，${message}`, reply: `${visitor.name}，${reply}` }] },
    }
  })
}
