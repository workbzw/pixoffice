import { useState } from 'react'
import { Armchair, ArrowRight, Download, MessageSquare, Square } from 'lucide-react'
import type { OfficeRuntime } from '@/runtime/OfficeRuntime'
import type { Snapshot } from '@/runtime/model'
import type { CommandResult } from '@/runtime/protocol'
import { commandBase, presentationCommand, visitCommand } from '@/runtime/adapters/legacy'

export type ScenePanel = 'controls' | 'plugins' | 'protocol'

function download(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
}

export function SceneControlPanel({ runtime, snapshot, panel }: { runtime: OfficeRuntime; snapshot: Snapshot; panel: ScenePanel }) {
  const [actorId, setActorId] = useState('marvis')
  const [hostId, setHostId] = useState('code-agent')
  const [text, setText] = useState('我们同步一下这一轮工作的进展。')
  const [meetingIds, setMeetingIds] = useState(['marvis', 'code-agent', 'file-agent', 'app-agent'])
  const [furniture, setFurniture] = useState('whiteboard-1:write')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<unknown>(null)
  const [json, setJson] = useState(() => JSON.stringify(visitCommand(runtime, 1, [2], () => '你好，我们同步一下。'), null, 2))
  const { world } = snapshot
  const actor = world.actors.find(item => item.id === actorId) ?? world.actors[0]
  const host = world.actors.find(item => item.id === hostId && item.id !== actor?.id) ?? world.actors.find(item => item.id !== actor?.id)
  const furnitureOptions = actor ? world.props.flatMap(prop => Object.entries(runtime.template(prop.templateId).interactions ?? {})
    .filter(([, interaction]) => !interaction.requiresHome || actor.homeId === prop.id)
    .map(([id, interaction]) => ({ key: `${prop.id}:${id}`, objectId: prop.id, interactionId: id, label: `${prop.name} · ${interaction.name}` }))) : []
  const selectedFurniture = furnitureOptions.find(option => option.key === furniture) ?? furnitureOptions[0]
  const check = (response: CommandResult) => { setError(response.error?.message ?? null) }
  const attempt = (fn: () => void) => { try { fn() } catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败') } }

  return <div className="runtime-panel-content">
    {error && <div className="runtime-panel-error" role="alert">{error}<button onClick={() => setError(null)} aria-label="关闭提示">×</button></div>}

    {panel === 'controls' && actor && <>
      <h2>场景控制</h2>
      <label>执行员工<select value={actor.id} onChange={event => setActorId(event.target.value)}>{world.actors.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label>拜访对象<select value={host?.id ?? ''} onChange={event => setHostId(event.target.value)}>{world.actors.filter(item => item.id !== actor.id).map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label>交接内容<textarea value={text} maxLength={500} onChange={event => setText(event.target.value)} rows={3} /></label>
      <button className="runtime-primary" disabled={!host || snapshot.editing} onClick={() => attempt(() => check(runtime.submit(visitCommand(runtime, world.actors.indexOf(actor) + 1, [world.actors.indexOf(host!) + 1], () => text))))}><MessageSquare size={15} />拜访工位<ArrowRight size={15} /></button>
      <div className="runtime-button-row"><button disabled={snapshot.editing} onClick={() => check(runtime.submit({ ...commandBase(runtime), type: 'activity.start', capability: 'office.focus', participants: [{ entityId: actor.id, role: 'worker' }], params: { title: text.slice(0, 100) || '专注工作' } }))}>开始专注</button><button onClick={() => check(runtime.submit(presentationCommand(runtime, actor.id, 'thinking', text.slice(0, 200))))}>更新状态</button></div>
      <h3>会议成员 <span>{meetingIds.length}/4</span></h3>
      <div className="runtime-attendees">{world.actors.map(item => <label key={item.id}><input type="checkbox" checked={meetingIds.includes(item.id)} disabled={!meetingIds.includes(item.id) && meetingIds.length >= 4} onChange={event => setMeetingIds(ids => event.target.checked ? [...ids, item.id] : ids.filter(id => id !== item.id))} />{item.name}</label>)}</div>
      <div className="runtime-button-row"><button disabled={meetingIds.length < 2 || snapshot.editing} onClick={() => attempt(() => {
        const board = world.props.find(prop => prop.templateId === 'office.whiteboard')
        if (!board) throw new Error('地图中没有白板')
        check(runtime.submit({ ...commandBase(runtime), type: 'activity.start', capability: 'office.meeting', participants: meetingIds.map((entityId, index) => ({ entityId, role: index === 0 ? 'speaker' : 'attendee' })), params: { boardId: board.id, text, durationMs: 12000 } }))
      })}>召集会议</button><button onClick={() => attempt(() => {
        const board = world.props.find(prop => prop.templateId === 'office.whiteboard')
        if (!board) throw new Error('地图中没有白板')
        check(runtime.submit({ ...commandBase(runtime), type: 'object.state.set', entityId: board.id, expectedStateRevision: board.stateRevision, state: { title: '本轮议题', text } }))
      })}>更新白板</button></div>
      <label>家具互动<select value={selectedFurniture?.key ?? ''} onChange={event => setFurniture(event.target.value)}>{furnitureOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
      <button className="runtime-secondary" disabled={!selectedFurniture || snapshot.editing} onClick={() => selectedFurniture && check(runtime.submit({ ...commandBase(runtime), type: 'activity.start', capability: 'furniture.use', participants: [{ entityId: actor.id, role: 'user' }], params: { objectId: selectedFurniture.objectId, interactionId: selectedFurniture.interactionId } }))}><Armchair size={15} />使用家具</button>
    </>}

    {panel === 'plugins' && <>
      <h2>内置插件 <span>{snapshot.plugins.length}</span></h2>
      {snapshot.plugins.map(plugin => <article className="runtime-plugin" key={plugin.id}><label><strong>{plugin.name}</strong><input type="checkbox" aria-label={`启用${plugin.name}`} checked={plugin.enabled} disabled={plugin.id === 'office.objects'} onChange={event => attempt(() => runtime.setPluginEnabled(plugin.id, event.target.checked))} /></label><small>{plugin.id} · {plugin.version}</small>{plugin.capabilities.map(capability => <code key={capability}>{capability}</code>)}</article>)}
      <h2>占用资源</h2>
      {snapshot.resources.filter(resource => resource.holders.length).map(resource => <div className="runtime-resource" key={resource.resource}><code>{resource.resource}</code><span>{resource.holders.length}/{resource.capacity}</span></div>)}
      {!snapshot.resources.some(resource => resource.holders.length) && <p className="runtime-empty">所有资源空闲</p>}
    </>}

    {panel === 'protocol' && <>
      <h2>场景协议</h2>
      <textarea aria-label="协议命令 JSON" className="runtime-json" spellCheck={false} value={json} onChange={event => setJson(event.target.value)} />
      <button className="runtime-primary" onClick={() => attempt(() => {
        const value: unknown = JSON.parse(json)
        const response = value && typeof value === 'object' && 'commands' in value ? runtime.submitBatch(value) : runtime.submit(value)
        setResult(response)
        const failed = Array.isArray(response) ? response.find(item => item.error) : response
        if (failed?.error) setError(failed.error.message)
        else setError(null)
      })}>执行命令<ArrowRight size={15} /></button>
      {result != null && <pre className="runtime-command-result">{JSON.stringify(result, null, 2)}</pre>}
      <div className="runtime-button-row"><button onClick={() => download(runtime.describe(), 'scene-capabilities.json')}><Download size={14} />协议说明</button><button onClick={() => download(runtime.snapshot(), 'scene-snapshot.json')}><Download size={14} />场景快照</button></div>
    </>}

    {panel === 'controls' && snapshot.activities.some(item => item.status === 'active') && <>
      <h2>正在执行</h2>
      {snapshot.activities.filter(item => item.status === 'active').map(activity => <div className="runtime-active-activity" key={activity.id}><div><strong>{activity.plan.title}</strong><button aria-label={`结束${activity.plan.title}`} title="结束活动" onClick={() => check(runtime.submit({ ...commandBase(runtime), type: 'activity.stop', activityId: activity.id }))}><Square size={13} /></button></div><small>{activity.plan.phases[activity.phaseIndex]?.title}</small></div>)}
    </>}
  </div>
}
