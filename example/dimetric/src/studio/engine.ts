import { createSceneRuntime, scenePrimitives } from '@pixoffice/runtime'
import type { ScenePack } from '@pixoffice/runtime'
import { initialSnapshot, workers } from './data.ts'
import type { StudioSnapshot, WorkerId } from './data.ts'

// Local demonstration data only. This is not a new public integration protocol.
export const studioScene: ScenePack = {
  manifest: { id: 'studio.preview', version: '1', apiVersion: 1 },
  plugins: [scenePrimitives, {
    id: 'studio.furniture', name: '视觉样板家具', version: '1', apiVersion: 1, capabilities: [],
    templates: [
      { id: 'studio.desk', name: '工位', view: 'studio.desk', footprint: { left: 0, top: 0, right: 2, bottom: 2 }, anchors: { visit: { x: 1, y: 2 } }, resources: {} },
      { id: 'studio.board', name: '项目白板', view: 'studio.board', footprint: { left: 0, top: 0, right: 3, bottom: 2 }, anchors: {}, resources: {} },
    ],
  }],
  createWorld: () => ({
    sceneId: 'studio-preview', unit: 'cell', width: 20, height: 20, gridSize: 1, layoutRevision: 0,
    bounds: { left: 0, top: 0, right: 20, bottom: 20 },
    walkableArea: [{ x: 0, y: 9 }, { x: 9, y: 0 }, { x: 17, y: 8 }, { x: 8, y: 17 }],
    actors: [{ id: 'helper', name: '派派', templateId: 'studio.robot', color: 0x527af4, position: { x: 6, y: 8 }, facing: 'front', posture: 'standing', presentation: { status: 'idle', title: '', sourceRevision: 0 } }],
    props: [
      ...workers.map(w => ({ id: w.id, name: `${w.name}的工位`, templateId: 'studio.desk', position: w.position, state: {}, stateRevision: 0 })),
      { id: 'board', name: '项目白板', templateId: 'studio.board', position: { x: 5, y: 5 }, state: {}, stateRevision: 0 },
    ],
  }),
}

export class StudioEngine {
  runtime = createSceneRuntime(studioScene)
  private state = initialSnapshot()
  private command = 0
  private currentCommand?: string
  private nextVisit = 1.5
  private visitIndex = 0
  private disposed = false
  snapshot(): StudioSnapshot { return structuredClone(this.state) }
  get running() { return this.state.running }
  setRunning(value: boolean) { this.state.running = value }
  resolveConflict() {
    const task = this.state.tasks.find(t => t.workerId === 'zhou')!
    if (task.status !== 'blocked') return
    task.status = 'running'; task.note = '已统一统计区间与定价口径，继续交叉校验'
    this.addLog('已确认示例数据口径，周理继续交叉校验')
  }
  visit(id: WorkerId) {
    if (this.currentCommand || this.disposed) return false
    const commandId = `studio-visit-${++this.command}`
    const result = this.runtime.submit({ protocolVersion: '2.0', sceneId: 'studio-preview', commandId,
      type: 'activity.start', capability: 'scene.move', participants: [{ entityId: 'helper', role: 'actor' }],
      params: { targetId: id, anchor: 'visit' }, busyPolicy: 'reject' })
    if (result.status !== 'running') return false
    this.currentCommand = commandId; this.state.robotTarget = id
    return true
  }
  tick(milliseconds: number) {
    if (this.disposed || !this.state.running || !Number.isFinite(milliseconds) || milliseconds <= 0) return
    const ms = Math.min(milliseconds, 100), seconds = ms / 1000
    this.state.elapsed += seconds
    this.runtime.tick(ms)
    for (const task of this.state.tasks) {
      if (task.status !== 'running') continue
      const worker = workers.find(w => w.id === task.workerId)!
      task.progress = Math.min(100, task.progress + worker.rate * seconds)
      if (task.progress === 100) { task.status = 'done'; task.note = `${worker.task}已完成，结果已汇入项目资料`; this.addLog(`${worker.name}完成了${worker.task}`) }
    }
    this.state.progress = Math.round(this.state.tasks.reduce((total, t) => total + t.progress, 0) / this.state.tasks.length)
    this.state.completed = this.state.tasks.filter(t => t.status === 'done').length
    if (this.currentCommand) {
      const record = this.runtime.getRecord(this.currentCommand)
      if (record && record.status !== 'running' && record.status !== 'queued') {
        if (record.status === 'completed') this.addLog(`派派正在与${workers.find(w => w.id === this.state.robotTarget)?.name ?? '成员'}同步进度`)
        this.currentCommand = undefined; this.nextVisit = this.state.elapsed + 7
      }
    } else if (this.state.elapsed >= this.nextVisit) {
      const target = workers[this.visitIndex++ % workers.length].id
      if (!this.visit(target)) this.nextVisit = this.state.elapsed + 3
    }
  }
  restart() {
    this.runtime.dispose(); this.runtime = createSceneRuntime(studioScene)
    this.state = initialSnapshot(); this.currentCommand = undefined; this.nextVisit = 1.5; this.visitIndex = 0
  }
  private addLog(text: string) { this.state.log.unshift({ id: ++this.command, text, time: this.state.elapsed }); this.state.log = this.state.log.slice(0, 30) }
  dispose() { if (this.disposed) return; this.disposed = true; this.runtime.dispose() }
}
