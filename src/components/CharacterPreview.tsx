import { useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { loadCharacterRegistry } from '@/scene/assets/loadApartmentAssets'
import { characterPreviewTimeline, type CharacterRegistry } from '@/scene/characters/packSchema'
import { CharacterArtwork } from './CharacterArtwork'
import { useCharacterPack } from './useCharacterPack'
import './CharacterPreview.css'

const ACTIONS: Record<string, string> = {
  idle: '站立', walk: '室内走路', run: '跑步', sit: '坐姿', 'stand-up': '起身', 'sit-down': '入座',
  emote: '表情', talk: '聆听', speak: '说话', work: '工作', 'archive-walk': '历史行走',
}
const DIRECTIONS: Record<string, string> = { front: '正面', back: '背面', left: '向左', right: '向右',
  'seated-left': '坐着向左转头', 'seated-right': '坐着向右转头', 'typing-back': '敲键盘（旧版）', 'computer-back': '电脑办公（旧版）', 'quiet-back': '轻微办公', wave: '挥手', thinking: '思考', surprised: '惊讶' }
const clipLabel = (name: string) => name.split('.').map(part => ACTIONS[part] ?? DIRECTIONS[part] ?? part).join(' · ')

function PreviewFigure({ id, label, clipName, playing, manualStep, guides }: {
  id: string; label: string; clipName: string; playing: boolean; manualStep: number; guides: boolean
}) {
  const figureRef = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(false)
  const [hidden, setHidden] = useState(document.hidden)
  const [index, setIndex] = useState(0)
  const previousStep = useRef(manualStep)
  const { pack, error } = useCharacterPack(id, visible)
  const clip = pack && characterPreviewTimeline(pack.manifest, clipName)
  const count = clip?.frames.length ?? 1
  const safeIndex = Math.min(index, count - 1)
  const duration = clip?.frames[safeIndex].durationMs ?? 1000
  const loop = clip?.loop
  useEffect(() => {
    const figure = figureRef.current
    if (!figure) return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { root: figure.closest('dialog'), rootMargin: '80px' })
    observer.observe(figure)
    const onVisibility = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [])
  useEffect(() => {
    if (!playing || !visible || hidden || count <= 1 || (!loop && index >= count - 1)) return
    const timer = setTimeout(() => setIndex(value => (value + 1) % count), duration)
    return () => clearTimeout(timer)
  }, [playing, visible, hidden, count, index, duration, loop])
  useEffect(() => {
    const delta = manualStep - previousStep.current
    previousStep.current = manualStep
    if (delta && !playing) setIndex(value => ((value + delta) % count + count) % count)
  }, [manualStep, playing, count])
  const elapsedMs = clip?.frames.slice(0, safeIndex).reduce((sum, frame) => sum + frame.durationMs, 0) ?? 0
  return <figure ref={figureRef} className="character-preview-item">
    <div className="character-preview-stage">
      {error ? <span role="alert">{error}</span> : pack ? <CharacterArtwork pack={pack} clip={clipName} elapsedMs={elapsedMs} guides={guides} label={label} /> : <span role="status">加载中…</span>}
    </div>
    <figcaption>{label}</figcaption>
    {pack && <div className="character-preview-meta"><Check size={12} />已加载 · {safeIndex + 1}/{count} 帧{clip?.fallback ? ' · 使用备用动作' : ''}</div>}
  </figure>
}

export function CharacterPreview({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [registry, setRegistry] = useState<CharacterRegistry>()
  const [error, setError] = useState('')
  const [selected, setSelected] = useState('all')
  const [clipName, setClipName] = useState('walk.back')
  const [comparisonOnly, setComparisonOnly] = useState(false)
  const [comparisonCharacter, setComparisonCharacter] = useState('marvis')
  const [comparisonMode, setComparisonMode] = useState('proportions')
  const [playing, setPlaying] = useState(true)
  const [manualStep, setManualStep] = useState(0)
  const [guides, setGuides] = useState(false)
  const [replay, setReplay] = useState(0)
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    let active = true
    void loadCharacterRegistry().then(value => { if (active) setRegistry(value) }).catch(reason => { if (active) setError(String(reason)) })
    return () => { active = false; dialog?.close() }
  }, [])
  const entries = registry?.characters.filter(entry => selected === 'all' || entry.id === selected) ?? []
  const clips = [...new Set(entries.flatMap(entry => entry.clips.includes('work.computer-back') ? [...entry.clips, 'work.quiet-back'] : entry.clips))].filter(name => !['pose.', 'mouth.', 'part.'].some(prefix => name.startsWith(prefix)) && (selected !== 'all' || !name.startsWith('archive-walk.')))
  const canCompare = Boolean(registry?.characters.length)
  const comparisonId = registry?.characters.some(entry => entry.id === comparisonCharacter) ? comparisonCharacter : registry?.characters[0]?.id ?? comparisonCharacter
  const hasQuietWork = (id: string) => Boolean(registry?.characters.find(entry => entry.id === id)?.clips.some(clip => clip === 'work.quiet-back' || clip === 'work.computer-back'))
  const canCompareQuiet = hasQuietWork(comparisonId)
  return <dialog ref={dialogRef} className="character-preview" aria-labelledby="character-preview-title" onClose={event => {
    if (!event.currentTarget.open) onClose()
  }}>
    <header className="character-preview-header"><h2 id="character-preview-title">人物预览</h2><button type="button" onClick={onClose}>关闭</button></header>
    <div className="character-preview-tabs" role="tablist" aria-label="人物展示">
      <button id="character-comparison-tab" type="button" role="tab" disabled={!canCompare} aria-selected={comparisonOnly} aria-controls="character-preview-panel" onClick={() => setComparisonOnly(true)}>动作对照</button>
      <button id="character-all-tab" type="button" role="tab" aria-selected={!comparisonOnly} aria-controls="character-preview-panel" onClick={() => setComparisonOnly(false)}>全部人物</button>
    </div>
    <div className="character-preview-controls">
      {!comparisonOnly && <><label>人物<select aria-label="人物" value={selected} onChange={event => { setSelected(event.target.value); setClipName('walk.back') }}>
        <option value="all">全部人物</option>{registry?.characters.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
      </select></label>
      <label>动作<select aria-label="动作" value={clipName} onChange={event => { setClipName(event.target.value); setReplay(value => value + 1) }}>
        {clips.map(name => <option key={name} value={name}>{clipLabel(name)}</option>)}
      </select></label></>}
      {comparisonOnly && <><label>人物<select aria-label="对照人物" value={comparisonId} onChange={event => {
        setComparisonCharacter(event.target.value)
        if (comparisonMode === 'quiet' && !hasQuietWork(event.target.value)) setComparisonMode('proportions')
      }}>
        {registry?.characters.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
      </select></label><label>对照<select aria-label="对照" value={comparisonMode} onChange={event => { setComparisonMode(event.target.value); setReplay(value => value + 1) }}>
        <option value="proportions">尺寸与姿态</option><option value="gait">走路与跑步</option>
        <option value="quiet" disabled={!canCompareQuiet}>坐姿与轻微办公</option>
      </select></label></>}
      <button type="button" aria-label={playing ? '暂停' : '播放'} title={playing ? '暂停' : '播放'} onClick={() => { setPlaying(value => !value); if (!playing) setReplay(value => value + 1) }}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
      <button type="button" aria-label="上一帧" title="上一帧" disabled={playing} onClick={() => setManualStep(value => value - 1)}><ChevronLeft size={16} /></button>
      <button type="button" aria-label="下一帧" title="下一帧" disabled={playing} onClick={() => setManualStep(value => value + 1)}><ChevronRight size={16} /></button>
      <label><input type="checkbox" checked={guides} onChange={event => setGuides(event.target.checked)} />地面与锚点</label>
    </div>
    {error && <p role="alert">{error}</p>}
    {!registry && !error && <p role="status">正在加载人物目录…</p>}
    {registry && <div id="character-preview-panel" role="tabpanel" aria-labelledby={comparisonOnly ? 'character-comparison-tab' : 'character-all-tab'} className={`character-preview-grid${comparisonOnly ? ' character-preview-grid--comparison' : ''}`}>
      {comparisonOnly ? (comparisonMode === 'quiet' ? ['sit.back', 'work.quiet-back'] : comparisonMode === 'gait' ? ['walk.front', 'walk.back', 'run.back'] : ['idle.back', 'sit.back', 'walk.back', 'stand-up.back', 'talk.seated-right', 'speak.seated-right']).map(name => <PreviewFigure key={`${comparisonId}-${name}-${replay}`} id={comparisonId} label={clipLabel(name)} clipName={name} playing={playing} manualStep={manualStep} guides={guides} />)
        : entries.map(entry => <PreviewFigure key={`${entry.id}-${clipName}-${replay}`} id={entry.id} label={entry.label} clipName={clipName} playing={playing} manualStep={manualStep} guides={guides} />)}
    </div>}
  </dialog>
}
