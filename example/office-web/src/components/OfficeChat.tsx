import { memo, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowDown, ArrowUp, Check, ChevronDown, Copy, MessageCircle, Plus, RotateCcw, Square } from 'lucide-react'
import type { ChatSession } from '../chat/ChatSession.ts'
import { CharacterAvatar } from './CharacterArtwork.tsx'
import type { DecisionSession } from '../application/decisions/DecisionSession.ts'
import { OfficeDecisionPanel } from '../ui/decisions/OfficeDecisionPanel.tsx'
import './OfficeChat.css'

export const OfficeChat = memo(function OfficeChat({ session, expanded, onExpandedChange, hidden, leaderAppearanceId, leaderName, decisionSession, decisionPreview = false, decisionOpenToken = 0 }: {
  session: ChatSession; expanded: boolean; onExpandedChange: (expanded: boolean) => void; hidden: boolean; leaderAppearanceId?: string; leaderName: string
  decisionSession: DecisionSession; decisionPreview?: boolean; decisionOpenToken?: number
}) {
  const source = session.source
  const chat = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const decisions = useSyncExternalStore(decisionSession.subscribe, decisionSession.getSnapshot)
  const draft = chat.draft
  const setDraft = (value: string) => session.setDraft(value)
  const [copied, setCopied] = useState<string | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const composer = useRef<HTMLFormElement>(null)
  const transcript = useRef<HTMLDivElement>(null)
  const followOutput = useRef(true)
  const composing = useRef(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const panelId = useId()
  const busy = chat.phase !== 'idle'
  const phase = chat.phase === 'thinking' ? '正在思考' : chat.phase === 'streaming' ? '正在回复' : '办公室对话'

  useEffect(() => () => clearTimeout(copyTimer.current), [])
  useLayoutEffect(() => {
    const element = textarea.current
    if (!element) return
    const resize = () => {
      element.style.height = '24px'; element.style.height = `${Math.min(96, element.scrollHeight)}px`
      root.current?.style.setProperty('--chat-composer-height', `${composer.current?.offsetHeight ?? 48}px`)
    }
    resize()
    let width = element.clientWidth
    const observer = new ResizeObserver(() => { if (element.clientWidth !== width) { width = element.clientWidth; resize() } })
    observer.observe(element)
    return () => observer.disconnect()
  }, [draft, hidden])
  useLayoutEffect(() => {
    if (expanded && followOutput.current && transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight
  }, [chat, expanded, decisions.records.length])

  const bottom = () => {
    followOutput.current = true; setAtBottom(true)
    transcript.current?.scrollTo({ top: transcript.current.scrollHeight, behavior: 'smooth' })
  }
  const submit = () => {
    if (!chat.ready || busy || !draft.trim()) return
    onExpandedChange(true); followOutput.current = true; setAtBottom(true)
    void session.send(draft); setDraft(''); textarea.current?.focus()
  }
  const collapse = () => { onExpandedChange(false); textarea.current?.focus() }
  const copy = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(id); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(null), 1800)
    } catch { setCopied(null) }
  }

  return <div ref={root} className="office-chat" hidden={hidden} data-expanded={expanded} onKeyDown={event => { if (event.key === 'Escape' && expanded) { event.stopPropagation(); collapse() } }}>
    <section id={panelId} className="office-chat-panel" aria-label="办公室对话" aria-hidden={!expanded} inert={!expanded}>
      <header className="office-chat-header">
        <div className="office-chat-identity"><CharacterAvatar appearanceId={leaderAppearanceId} /><div><strong>{leaderName}</strong><span role="status" aria-live="polite">{chat.ready ? phase : '正在恢复对话'}</span></div>{source.kind === 'preview' && <small>交互预览</small>}</div>
        <div className="office-chat-tools">
          {decisionPreview && <button type="button" title="重新演示决策" aria-label="重新演示决策" onClick={() => { decisionSession.reset(); onExpandedChange(false) }}><RotateCcw size={17} /></button>}
          <button type="button" title="新对话" aria-label="新对话" disabled={!chat.ready || busy || !chat.messages.length} onClick={() => { session.clear(); textarea.current?.focus() }}><Plus size={18} /></button>
          <button type="button" title="收起对话" aria-label="收起对话" onClick={collapse}><ChevronDown size={20} /></button>
        </div>
      </header>
      <div className="office-chat-transcript" ref={transcript} role="log" aria-label="对话内容" aria-live="off" onScroll={() => {
        const element = transcript.current!
        const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 48
        followOutput.current = nearBottom; setAtBottom(nearBottom)
      }}>
        {!chat.messages.length && !decisions.records.length && <div className="office-chat-empty"><CharacterAvatar appearanceId={leaderAppearanceId} /><h2>今天一起做点什么？</h2></div>}
        {chat.messages.map(message => <article key={message.id} className={`office-chat-message is-${message.role}`} aria-label={message.role === 'user' ? '你' : leaderName}>
          <div className="office-chat-message-meta"><span>{message.role === 'user' ? '你' : leaderName}</span>{message.role === 'assistant' && message.content && message.state !== 'pending' && <button type="button" title={copied === message.id ? '已复制' : '复制回复'} aria-label={copied === message.id ? '已复制' : '复制回复'} onClick={() => { void copy(message.id, message.content) }}>{copied === message.id ? <Check size={14} /> : <Copy size={14} />}</button>}</div>
          {message.content ? <p>{message.content}{message.state === 'pending' && <span className="office-chat-caret" aria-hidden="true" />}</p> : message.state === 'pending' ? <div className="office-chat-pending"><span /><span /><span /><small>{source.kind === 'preview' ? '预览回复准备中' : '正在思考'}</small></div> : null}
          {message.state === 'stopped' && <small className="office-chat-interrupted">已停止生成</small>}
        </article>)}
        {decisions.records.map(record => <article key={record.id} className="office-decision-record" aria-label="决策记录">
          <header><Check size={13} /><span>{record.request.requester.name} · 待你决定</span>{decisionPreview && <small>本地演示</small>}</header>
          <p>{record.request.title}</p><strong><Check size={14} />{record.label}</strong>
        </article>)}
        {chat.error && <div className="office-chat-error" role="alert"><span>{chat.error}</span><button type="button" onClick={() => { setDraft([...chat.messages].reverse().find(message => message.role === 'user')?.content ?? ''); textarea.current?.focus() }}>重新编辑</button></div>}
        {chat.storageError && <div className="office-chat-error" role="alert">{chat.storageError}</div>}
      </div>
      {!atBottom && <button type="button" className="office-chat-latest" title="回到最新消息" aria-label="回到最新消息" onClick={bottom}><ArrowDown size={17} /></button>}
    </section>
    <OfficeDecisionPanel preview={decisionPreview} hidden={expanded} openToken={decisionOpenToken} snapshot={decisions} onResolve={(decisionId, choiceId) => { void decisionSession.choose(decisionSession.teamId, decisionId, choiceId) }}
      onShowRecords={() => { followOutput.current = true; setAtBottom(true); onExpandedChange(true) }} onReset={() => decisionSession.reset()} />
    <form ref={composer} className="office-chat-composer" data-busy={busy} aria-label="发送消息" onSubmit={event => { event.preventDefault(); submit() }}>
      <button type="button" className="office-chat-history" aria-label={expanded ? '收起对话' : '展开对话'} title={expanded ? '收起对话' : '展开对话'} aria-expanded={expanded} aria-controls={panelId} onClick={() => { onExpandedChange(!expanded); textarea.current?.focus() }}><MessageCircle size={21} /></button>
      <textarea ref={textarea} value={draft} rows={1} maxLength={4000} disabled={!chat.ready} aria-label="给办公室发送消息" placeholder="和办公室聊一聊…" onChange={event => setDraft(event.target.value)} onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }} onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) { event.preventDefault(); submit() }
      }} />
      {busy ? <button type="button" className="office-chat-send" title="停止生成" aria-label="停止生成" onClick={() => session.stop()}><Square size={15} fill="currentColor" /></button> : <button type="submit" className="office-chat-send" title="发送消息" aria-label="发送消息" disabled={!chat.ready || !draft.trim()}><ArrowUp size={21} /></button>}
    </form>
  </div>
})
