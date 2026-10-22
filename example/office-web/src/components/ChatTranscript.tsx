import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Ref } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Check, ChevronUp, Copy, LoaderCircle, MessageCircle, RefreshCw } from 'lucide-react'
import type { ChatSession, ChatSnapshot } from '../chat/ChatSession.ts'
import type { DecisionRecord } from '../application/decisions/DecisionSession.ts'
import { ChatMarkdown } from './ChatMarkdown.tsx'

export type ChatTranscriptHandle = { toBottom: () => void }

export function ChatTranscript({ ref, session, chat, records, expanded, leaderName, preview, storageError, onAtBottomChange, onEdit }: {
  ref: Ref<ChatTranscriptHandle>; session: ChatSession; chat: ChatSnapshot; records: DecisionRecord[]; expanded: boolean
  leaderName: string; preview: boolean; storageError: string | null; onAtBottomChange: (value: boolean) => void; onEdit: () => void
}) {
  'use no memo'
  const scroll = useRef<HTMLDivElement>(null), lastScrollTop = useRef(0)
  const [atStart, setAtStart] = useState(false)
  const [copied, setCopied] = useState(''), copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(copyTimer.current), [])
  const rows = useMemo(() => [
    ...chat.messages.map(message => ({ id: message.id, kind: 'message' as const, message })),
    ...records.map(record => ({ id: record.id, kind: 'decision' as const, record })),
    ...(!chat.messages.length && !records.length ? [{ id: '@empty', kind: 'empty' as const }] : []),
    ...(chat.syncing || chat.historyError || chat.error ? [{ id: '@status', kind: 'status' as const }] : []),
    ...(chat.storageError || storageError ? [{ id: '@storage', kind: 'storage' as const }] : []),
  ], [chat, records, storageError])
  // eslint-disable-next-line react-hooks/incompatible-library -- Keep this mutable virtualizer local to the non-memoized transcript.
  const virtualizer = useVirtualizer({
    count: rows.length, getScrollElement: () => scroll.current, getItemKey: index => rows[index].id,
    estimateSize: () => 140, overscan: 6, anchorTo: 'end', followOnAppend: true, scrollEndThreshold: 64,
    directDomUpdates: true, enabled: expanded, paddingStart: 22, paddingEnd: 18,
    onChange: instance => { onAtBottomChange(instance.isAtEnd()); setAtStart((instance.scrollOffset ?? 0) < 200) },
  })
  useImperativeHandle(ref, () => ({ toBottom: () => virtualizer.scrollToEnd() }), [virtualizer])
  const latestUser = chat.messages.findLast(message => message.role === 'user')?.id
  useLayoutEffect(() => { if (expanded) virtualizer.scrollToEnd() }, [expanded, latestUser, virtualizer])
  const copy = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content); setCopied(id); clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(''), 1800)
    } catch { setCopied('') }
  }
  return <div className="office-chat-transcript-wrap">
    {(chat.hasMoreHistory || chat.olderError) && (atStart || chat.loadingOlder || chat.olderError) && <div className="office-chat-history-page">{chat.olderError && <span role="alert">{chat.olderError}</span>}<button type="button" disabled={chat.loadingOlder} onClick={() => { void session.loadOlder() }}>{chat.loadingOlder ? <LoaderCircle size={14} /> : <ChevronUp size={14} />}{chat.loadingOlder ? '加载中…' : '加载更早消息'}</button></div>}
    <div className="office-chat-transcript" ref={scroll} role="log" aria-label="对话内容" aria-live="off" onScroll={event => {
    const top = event.currentTarget.scrollTop, movingUp = top < lastScrollTop.current
    lastScrollTop.current = top
    if (movingUp && top >= 0 && top < 200 && !chat.olderError) void session.loadOlder()
  }}>
    <div ref={virtualizer.containerRef} className="office-chat-virtual-list">
      {virtualizer.getVirtualItems().map(item => {
        const row = rows[item.index]
        return <div key={row.id} data-index={item.index} ref={virtualizer.measureElement} className="office-chat-row">
          {row.kind === 'message' && <article className={`office-chat-message is-${row.message.role}`} aria-label={row.message.role === 'user' ? '你' : leaderName}>
            <span className="office-chat-message-avatar">{row.message.role === 'assistant' ? 'AI' : '我'}</span><div className="office-chat-message-content">
              <div className="office-chat-message-meta"><span>{row.message.role === 'user' ? '你' : '办公室助手'}</span>{row.message.role === 'assistant' && row.message.content && row.message.state !== 'pending' && <button type="button" title={copied === row.id ? '已复制' : '复制回复'} aria-label={copied === row.id ? '已复制' : '复制回复'} onClick={() => { void copy(row.id, row.message.content) }}>{copied === row.id ? <Check size={14} /> : <Copy size={14} />}</button>}</div>
              <div className="office-chat-bubble">{row.message.content ? row.message.role === 'assistant' ? <ChatMarkdown content={row.message.content} pending={row.message.state === 'pending'} /> : <p className="office-chat-user-text">{row.message.content}</p> : row.message.state === 'pending' ? <div className="office-chat-pending"><span /><span /><span /><small>{session.source.kind === 'preview' ? '预览回复准备中' : '正在思考'}</small></div> : null}
                {row.message.state === 'stopped' && <small className="office-chat-interrupted">已停止生成</small>}
                {row.message.state === 'error' && <small className="office-chat-interrupted">回复未完成</small>}
              </div>
            </div>
          </article>}
          {row.kind === 'decision' && <article className="office-decision-record" aria-label="决策记录"><header><Check size={13} /><span>{row.record.request.requester.name} · 待你决定</span>{preview && <small>本地演示</small>}</header><p>{row.record.request.title}</p><strong><Check size={14} />{row.record.label}</strong></article>}
          {row.kind === 'empty' && <div className="office-chat-empty"><MessageCircle size={30} /><h2>今天一起做点什么？</h2></div>}
          {row.kind === 'status' && <div className="office-chat-error" role={chat.syncing ? 'status' : 'alert'}><span>{chat.syncing ? '正在同步聊天记录…' : chat.historyError || chat.error}</span>{!chat.syncing && (session.source.history ? <button type="button" onClick={() => { void session.synchronize(true) }}><RefreshCw size={14} />重新同步</button> : <button type="button" onClick={onEdit}>重新编辑</button>)}</div>}
          {row.kind === 'storage' && <div className="office-chat-error" role="alert">{chat.storageError || storageError}</div>}
        </div>
      })}
    </div>
  </div>
  </div>
}
