import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowDown, ArrowUp, Check, ChevronDown, Copy, MessageCircle, Plus, Square } from 'lucide-react'
import { ChatSession } from '@/chat/ChatSession'
import type { OfficeChatSource } from '@/chat/contract'
import { CharacterAvatar } from './CharacterArtwork'
import './OfficeChat.css'

export const OfficeChat = memo(function OfficeChat({ source, expanded, onExpandedChange, hidden, leaderId, leaderName }: {
  source: OfficeChatSource; expanded: boolean; onExpandedChange: (expanded: boolean) => void; hidden: boolean; leaderId: string; leaderName: string
}) {
  const session = useMemo(() => new ChatSession(source), [source])
  const chat = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const [draft, setDraft] = useState('')
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

  useEffect(() => () => { session.dispose(); clearTimeout(copyTimer.current) }, [session])
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
  }, [chat, expanded])

  const bottom = () => {
    followOutput.current = true; setAtBottom(true)
    transcript.current?.scrollTo({ top: transcript.current.scrollHeight, behavior: 'smooth' })
  }
  const submit = () => {
    if (busy || !draft.trim()) return
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
        <div className="office-chat-identity"><CharacterAvatar id={leaderId} /><div><strong>{leaderName}</strong><span role="status" aria-live="polite">{phase}</span></div>{source.kind === 'preview' && <small>交互预览</small>}</div>
        <div className="office-chat-tools">
          <button type="button" title="新对话" aria-label="新对话" disabled={busy || !chat.messages.length} onClick={() => { session.clear(); textarea.current?.focus() }}><Plus size={18} /></button>
          <button type="button" title="收起对话" aria-label="收起对话" onClick={collapse}><ChevronDown size={20} /></button>
        </div>
      </header>
      <div className="office-chat-transcript" ref={transcript} role="log" aria-label="对话内容" aria-live="off" onScroll={() => {
        const element = transcript.current!
        const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 48
        followOutput.current = nearBottom; setAtBottom(nearBottom)
      }}>
        {!chat.messages.length && <div className="office-chat-empty"><CharacterAvatar id={leaderId} /><h2>今天一起做点什么？</h2></div>}
        {chat.messages.map(message => <article key={message.id} className={`office-chat-message is-${message.role}`} aria-label={message.role === 'user' ? '你' : leaderName}>
          <div className="office-chat-message-meta"><span>{message.role === 'user' ? '你' : leaderName}</span>{message.role === 'assistant' && message.content && message.state !== 'pending' && <button type="button" title={copied === message.id ? '已复制' : '复制回复'} aria-label={copied === message.id ? '已复制' : '复制回复'} onClick={() => { void copy(message.id, message.content) }}>{copied === message.id ? <Check size={14} /> : <Copy size={14} />}</button>}</div>
          {message.content ? <p>{message.content}{message.state === 'pending' && <span className="office-chat-caret" aria-hidden="true" />}</p> : message.state === 'pending' ? <div className="office-chat-pending"><span /><span /><span /><small>{source.kind === 'preview' ? '预览回复准备中' : '正在思考'}</small></div> : null}
          {message.state === 'stopped' && <small className="office-chat-interrupted">已停止生成</small>}
        </article>)}
        {chat.error && <div className="office-chat-error" role="alert"><span>{chat.error}</span><button type="button" onClick={() => { setDraft([...chat.messages].reverse().find(message => message.role === 'user')?.content ?? ''); textarea.current?.focus() }}>重新编辑</button></div>}
      </div>
      {!atBottom && <button type="button" className="office-chat-latest" title="回到最新消息" aria-label="回到最新消息" onClick={bottom}><ArrowDown size={17} /></button>}
    </section>
    <form ref={composer} className="office-chat-composer" data-busy={busy} aria-label="发送消息" onSubmit={event => { event.preventDefault(); submit() }}>
      <button type="button" className="office-chat-history" aria-label={expanded ? '收起对话' : '展开对话'} title={expanded ? '收起对话' : '展开对话'} aria-expanded={expanded} aria-controls={panelId} onClick={() => { onExpandedChange(!expanded); textarea.current?.focus() }}><MessageCircle size={21} /></button>
      <textarea ref={textarea} value={draft} rows={1} maxLength={4000} aria-label="给办公室发送消息" placeholder="和办公室聊一聊…" onChange={event => setDraft(event.target.value)} onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }} onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) { event.preventDefault(); submit() }
      }} />
      {busy ? <button type="button" className="office-chat-send" title="停止生成" aria-label="停止生成" onClick={() => session.stop()}><Square size={15} fill="currentColor" /></button> : <button type="submit" className="office-chat-send" title="发送消息" aria-label="发送消息" disabled={!draft.trim()}><ArrowUp size={21} /></button>}
    </form>
  </div>
})
