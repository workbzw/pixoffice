import type { ComponentType } from 'react'
import type { AgentInsightBlock } from '@pixoffice/protocol/agent-insights'

const colors = ['#35b889', '#5d8ee8', '#e9ae42', '#a08acb', '#cf7b77', '#9aa9a0']
type BlockOf<T extends AgentInsightBlock['type']> = Extract<AgentInsightBlock, { type: T }>

function Trend({ block }: { block: BlockOf<'trend'> }) {
  const max = Math.max(1, ...block.points.map(point => point.value))
  const points = block.points.map((point, i) => ({ ...point, x: 12 + (block.points.length === 1 ? 148 : i * 296 / (block.points.length - 1)), y: 90 - point.value / max * 72 }))
  return <div className="agent-insight-trend">
    <svg viewBox="0 0 320 110" role="img" aria-label={`${block.title}，${block.points.map(point => `${point.label} ${point.value}${block.unit ?? ''}`).join('，')}`}>
      {[18, 54, 90].map(y => <line key={y} x1="12" x2="308" y1={y} y2={y} stroke="#e9eeeb" strokeDasharray="3 4" />)}
      <polygon points={`12,90 ${points.map(point => `${point.x},${point.y}`).join(' ')} 308,90`} fill="#eef5fc" />
      <polyline points={points.map(point => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#5d8ee8" strokeWidth="2.5" strokeLinejoin="round" />
      {points.map((point, i) => <circle key={i} cx={point.x} cy={point.y} r="3" fill="#fff" stroke="#5d8ee8" strokeWidth="2"><title>{`${point.label}：${point.value}${block.unit ?? ''}`}</title></circle>)}
      <text x="12" y="107">{points[0].label}</text><text x="308" y="107" textAnchor="end">{points.at(-1)!.label}</text>
    </svg>
  </div>
}

function Bars({ block }: { block: BlockOf<'bars'> }) {
  const max = Math.max(1, ...block.items.map(item => item.value))
  return <ul className="agent-insight-bars">{block.items.map((item, i) => <li key={i}>
    <span>{item.label}</span><div><i style={{ width: `${item.value / max * 100}%`, background: colors[i % colors.length] }} /></div>
    <strong>{item.value}<small>{block.unit}</small></strong>
  </li>)}</ul>
}

function Distribution({ block }: { block: BlockOf<'distribution'> }) {
  const total = block.items.reduce((sum, item) => sum + item.value, 0)
  let position = 0
  const stops = block.items.map((item, i) => {
    const start = position; position += total ? item.value / total * 100 : 0
    return `${colors[i % colors.length]} ${start}% ${position}%`
  })
  return <div className="agent-insight-distribution">
    <div className="agent-insight-donut" role="img" aria-label={block.items.map(item => `${item.label} ${item.value}`).join('，')}
      style={{ background: total ? `conic-gradient(${stops.join(',')})` : '#e9eeeb' }}><span><strong>{total}</strong><small>合计</small></span></div>
    <ul>{block.items.map((item, i) => <li key={i}><i style={{ background: colors[i % colors.length] }} /><span>{item.label}</span><strong>{total ? Math.round(item.value / total * 100) : 0}%</strong></li>)}</ul>
  </div>
}

function Activity({ block }: { block: BlockOf<'activity'> }) {
  return <ul className="agent-insight-activity">{block.items.map((item, i) => <li key={i}>
    <i className={`is-${item.status}`} /><span>{item.label}</span><time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}</time>
  </li>)}{!block.items.length && <li>暂无动态</li>}</ul>
}

// Business roles never choose a React component; validated block types do.
const renderers = { trend: Trend, bars: Bars, distribution: Distribution, activity: Activity }
export function InsightBlock({ block }: { block: AgentInsightBlock }) {
  const Renderer = renderers[block.type] as ComponentType<{ block: AgentInsightBlock }>
  return <section className={`agent-insight-block block-${block.type}`}><h3>{block.title}</h3><Renderer block={block} /></section>
}
