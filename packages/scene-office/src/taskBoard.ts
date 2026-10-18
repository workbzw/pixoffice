import { whiteboardTaskBoard, type WhiteboardTaskBoardData } from './whiteboard.ts'
import { whiteboardIcons } from './whiteboardIcons.ts'

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
const statusLabels = { queued: '待开始', running: '执行中', blocked: '待处理', completed: '已完成', failed: '需关注' }
const accents = ['#4c84e8', '#20af78', '#e7a62d']
const surfaces = {
  paper: { row: '#ffffffb3', border: '1px solid #e4e8ed', shadow: '0 1px 3px #2339570a', track: '#e8ecf0' },
  wall: { row: 'transparent', border: 'none', shadow: 'none', track: '#78848e26' },
} as const
type WhiteboardSurface = keyof typeof surfaces
export const WHITEBOARD_PREVIEW_LAYOUT = { width: 778, height: 314, fontSize: 26 } as const
const icon = (name: keyof typeof whiteboardIcons, size: string, color: string) => `<span style="display:inline-flex;flex:none;width:${size};height:${size};color:${color}">${whiteboardIcons[name].replace('width="24"', 'width="100%"').replace('height="24"', 'height="100%"')}</span>`

/** Fixed presentation markup. Backend content is text/data, never HTML or CSS. */
export function renderTaskBoard(data: WhiteboardTaskBoardData, surface: WhiteboardSurface = 'paper'): string {
  const material = surfaces[surface]
  const wall = surface === 'wall'
  const steps = data.steps.map((step, index) => {
    const progress = step.progress === undefined || step.progress < 0 ? null : Math.round(step.progress)
    const color = index === 1 ? '#e9ae3e' : '#32ba84'
    return `<li style="display:flex;align-items:center;gap:${wall ? '.5em' : '.65em'};box-sizing:border-box;min-width:0;height:${wall ? '2.35em' : '2.65em'};padding:${wall ? '.25em .3em' : '.4em .65em'};border:${material.border};border-radius:6px;background:${material.row};box-shadow:${material.shadow}">
      <span style="display:flex;align-items:center;justify-content:center;flex:none;width:1.75em;height:1.75em;border-radius:50%;background:${accents[index]};color:white;font-size:1.05em;box-shadow:inset 0 0 0 2px #ffffff40">${index + 1}</span>
      <div style="flex:1;min-width:0"><div title="${escape(step.title)}" style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:1em;font-weight:650;line-height:1.2">${escape(step.title)}</div>
      <div style="display:flex;align-items:center;gap:.5em;margin-top:.35em"><div role="progressbar" aria-label="${escape(step.title)}" ${progress === null ? '' : `aria-valuenow="${progress}"`} aria-valuemin="0" aria-valuemax="100" style="flex:1;height:.38em;overflow:hidden;border-radius:5px;background:${material.track}"><div style="width:${progress ?? 0}%;height:100%;border-radius:5px;background:${color}"></div></div><span style="flex:none;min-width:2.7em;text-align:right;font-size:${wall ? '.8em' : '.7em'};color:#68758a">${progress === null ? '—' : `${progress}%`}</span></div></div>
    </li>`
  }).join('')
  const link = data.link?.url
    ? `<a href="${escape(data.link.url)}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:.25em;color:#6288b4;font-size:.8em;line-height:${wall ? '1.2' : 'inherit'};text-decoration:none">${escape(data.link.label ?? '')}${icon('arrow', '1em', '#6288b4')}</a>`
    : `<a href="#whiteboard-steps" style="display:inline-flex;align-items:center;gap:.25em;color:#6288b4;font-size:.8em;line-height:${wall ? '1.2' : 'inherit'};text-decoration:none">查看任务拆解${icon('arrow', '1em', '#6288b4')}</a>`
  return `<section class="task-whiteboard" aria-label="任务白板" style="box-sizing:border-box;width:100%;padding:${wall ? '.1em 0 .3em' : '.2em 0 .8em'};color:#203450;font-family:system-ui,sans-serif;line-height:1.6;letter-spacing:0">
    <header style="display:flex;align-items:center;justify-content:space-between;gap:1em;height:${wall ? '1.95em' : '2.45em'};margin-bottom:${wall ? '.2em' : '.35em'}">
      <div style="display:flex;align-items:center;gap:.4em;min-width:0">${icon('lightbulb', wall ? '1.8em' : '2.05em', '#e9b43c')}<strong style="font-size:${wall ? '1.8em' : '2em'};line-height:1.1;font-weight:750;white-space:nowrap">${statusLabels[data.status]}</strong></div>
      <span style="font-size:.8em;color:#84909b;white-space:nowrap">${escape(data.tagline || '把计划变成成果')}</span>
    </header>
    <div class="task-whiteboard-columns" style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:${wall ? '.9em' : '1.3em'};align-items:start">
      <div style="min-width:0;padding-top:.15em">
        <div style="display:flex;align-items:center;gap:.4em;min-width:0;margin-bottom:${wall ? '.2em' : '.45em'}">${icon('file', '1.3em', '#638dd2')}<h3 title="${escape(data.title)}" style="margin:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:1.2em;line-height:1.3;font-weight:700">${escape(data.title)}</h3></div>
        <p style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin:0 0 ${wall ? '.25em' : '.45em'};min-height:${wall ? '0' : '2.8em'};font-size:.85em;line-height:${wall ? '1.35' : '1.4'};color:#778390">${escape(data.description ?? '')}</p>
        ${link}
        ${data.note ? `<aside style="box-sizing:border-box;width:90%;margin-top:${wall ? '.35em' : '.65em'};padding:${wall ? '.3em .5em' : '.5em .75em'};background:#fff0ad;color:#7d775c;box-shadow:1px 2px 4px #4d442514;transform:rotate(-1deg);font-size:.8em;line-height:${wall ? '1.3' : '1.4'}"><div style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escape(data.note)}</div></aside>` : ''}
      </div>
      <ol id="whiteboard-steps" style="display:flex;flex-direction:column;gap:${wall ? '.3em' : '.4em'};min-width:0;margin:0;padding:0;list-style:none">${steps || '<li style="padding:1em;color:#84909b">等待任务拆解</li>'}</ol>
    </div>
  </section>`
}

export function renderWhiteboardContent(state: Record<string, unknown>, surface: WhiteboardSurface = 'paper'): string {
  const board = whiteboardTaskBoard(state)
  return board ? renderTaskBoard(board, surface) : '<p role="status" style="margin:0;color:#84909b">等待任务拆解</p>'
}

/** The scene retains the reader's columns with denser spacing for larger, legible text. */
export function renderWhiteboardPreview(state: Record<string, unknown>): string {
  const { width, height, fontSize } = WHITEBOARD_PREVIEW_LAYOUT
  return `<div style="box-sizing:border-box;width:${width}px;height:${height}px;padding:8px 24px 16px;font-size:${fontSize}px;line-height:1.6;color:#343b36;background:transparent;border-radius:8px;overflow:hidden;white-space:normal;overflow-wrap:anywhere">${renderWhiteboardContent(state, 'wall')}</div>`
}
