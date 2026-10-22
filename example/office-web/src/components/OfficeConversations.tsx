import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, LoaderCircle, MessageCircle, Plus, Search, Trash2 } from 'lucide-react'
import type { ChatWorkspace, ChatWorkspaceSnapshot } from '../chat/ChatWorkspace.ts'
import { conversationState } from '../chat/ChatWorkspace.ts'
import type { DecisionSnapshot } from '../application/decisions/DecisionSession.ts'
import './OfficeConversations.css'

export function ConversationTabs({ workspace, state, decisions, menuOpen, onMenuOpenChange, menuId, onCollapse, panelId }: {
  workspace: ChatWorkspace; state: ChatWorkspaceSnapshot; decisions: DecisionSnapshot
  menuOpen: boolean; onMenuOpenChange: (open: boolean) => void; menuId: string; onCollapse: () => void; panelId: string
}) {
  const [query, setQuery] = useState('')
  const [deleteId, setDeleteId] = useState(''), [deleteError, setDeleteError] = useState('')
  const menu = useRef<HTMLDivElement>(null), selectedTab = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!menuOpen) return
    const close = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) { setDeleteId(''); setDeleteError(''); onMenuOpenChange(false) } }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menuOpen, onMenuOpenChange])
  useEffect(() => { selectedTab.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }, [state.selectedId])
  const select = (id: string) => { workspace.select(id); onMenuOpenChange(false); setQuery('') }
  const count = (id: string) => decisions.pending.filter(item => item.conversationId === id).length
  const filtered = state.conversations.filter(entry => entry.title.toLowerCase().includes(query.trim().toLowerCase()))
  const deleting = state.conversations.find(entry => entry.id === deleteId)
  const busy = state.deletingIds.includes(deleteId)
  const remove = async () => {
    setDeleteError('')
    try { await workspace.remove(deleteId); setDeleteId(''); onMenuOpenChange(false) }
    catch (error) { setDeleteError(error instanceof Error ? error.message : '删除失败，请重试') }
  }
  return <div className="office-conversation-nav">
    <div className="office-conversation-tabs" role="tablist" aria-label="办公室会话">
      {state.conversations.map((entry, index) => <div key={entry.id} className="office-conversation-tab-item" role="presentation" data-selected={entry.id === state.selectedId}>
        <button ref={entry.id === state.selectedId ? selectedTab : undefined} type="button" role="tab" aria-selected={entry.id === state.selectedId} tabIndex={entry.id === state.selectedId ? 0 : -1}
        onKeyDown={event => {
          const count = state.conversations.length
          const next = event.key === 'ArrowRight' ? (index + 1) % count : event.key === 'ArrowLeft' ? (index + count - 1) % count : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : -1
          if (next < 0) return
          event.preventDefault(); select(state.conversations[next].id)
          requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.office-conversation-tab[aria-selected=true]')?.focus())
        }}
        className="office-conversation-tab" title={entry.title} onClick={() => select(entry.id)}>
        <span className={`office-chat-dot is-${conversationState(entry)}`} /><span>{entry.title}</span>{count(entry.id) > 0 && <small>{count(entry.id)}</small>}
        </button>
        <button type="button" className="office-conversation-tab-delete" title={`删除会话：${entry.title}`} aria-label={`删除会话：${entry.title}`} disabled={state.deletingIds.includes(entry.id)} tabIndex={entry.id === state.selectedId ? 0 : -1} onClick={() => { setDeleteId(entry.id); setDeleteError(''); onMenuOpenChange(true) }}><Trash2 size={13} /></button>
      </div>)}
    </div>
    <div className="office-conversation-actions" ref={menu} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onMenuOpenChange(false) } }}>
      <button type="button" className="office-conversation-add" title="新会话" aria-label="新会话" disabled={!state.ready} onClick={() => { workspace.create(); onMenuOpenChange(false) }}><Plus size={17} /></button>
      <button type="button" className="office-conversation-collapse" title="收起聊天" aria-label="收起聊天" aria-controls={panelId} aria-expanded={true} onClick={onCollapse}><ChevronDown size={19} /></button>
      {menuOpen && <div id={menuId} className="office-conversation-menu" role="dialog" aria-label="全部会话">
        {deleting ? <div className="office-conversation-delete-confirm" role="alertdialog" aria-label="删除会话">
          <strong>删除「{deleting.title}」？</strong>
          <p>聊天记录和草稿将被删除，正在生成的回复会停止。</p>
          {workspace.requiresBackendDeletion(deleteId) && <p>需等待后端确认；关联任务如何处理由后端决定。</p>}
          {deleteError && <p className="office-conversation-delete-error" role="alert">{deleteError}</p>}
          <div><button type="button" disabled={busy} autoFocus onClick={() => { setDeleteId(''); setDeleteError(''); onMenuOpenChange(false) }}>取消</button><button type="button" className="office-conversation-delete-submit" disabled={busy} onClick={() => { void remove() }}>{busy ? <LoaderCircle size={14} className="office-conversation-spinner" /> : <Trash2 size={14} />}{busy ? '正在删除…' : '删除'}</button></div>
        </div> : <>
        <label className="office-conversation-search"><Search size={15} /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索会话" aria-label="搜索会话" /></label>
        <div className="office-conversation-menu-list">{filtered.map(entry => <button key={entry.id} type="button" className="office-conversation-select" aria-pressed={state.selectedId === entry.id} onClick={() => select(entry.id)}><MessageCircle size={15} /><span>{entry.title}</span>{count(entry.id) > 0 && <small>{count(entry.id)}</small>}{entry.id === state.selectedId && <Check size={15} />}</button>)}
          {!filtered.length && <p>没有找到会话</p>}
        </div>
        </>}
      </div>}
    </div>
  </div>
}
