import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, X } from 'lucide-react'
import { whiteboardTaskBoard } from '@pixoffice/scene-office/whiteboard'
import type { WhiteboardProgress } from '@pixoffice/scene-office/whiteboard'
import { renderWhiteboardContent } from '@pixoffice/scene-office/task-board'
import { stringifyDocumentObject } from '@pixoffice/protocol/schema'
import './WhiteboardReader.css'

export function WhiteboardReader({ state, boardId, progress, onClose }: { state: Record<string, unknown>; boardId: string; progress: WhiteboardProgress; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const serialized = JSON.stringify(state)
  const board = useMemo(() => whiteboardTaskBoard(JSON.parse(serialized)), [serialized])
  const [frame, setFrame] = useState(0)
  const html = useMemo(() => {
    void frame
    return renderWhiteboardContent(board ? { taskBoard: progress.project(boardId, board) } : {})
  }, [board, boardId, progress, frame])
  useEffect(() => {
    if (board?.status !== 'running') return
    const timer = setInterval(() => setFrame(value => value + 1), 250)
    return () => clearInterval(timer)
  }, [board?.status])
  useEffect(() => {
    const element = dialog.current!
    element.showModal()
    return () => { element.close() }
  }, [])
  const download = () => {
    if (!board) return
    const url = URL.createObjectURL(new Blob([stringifyDocumentObject(board, 2)], { type: 'application/json;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = 'whiteboard.json'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <dialog className="whiteboard-reader" ref={dialog} aria-labelledby="whiteboard-reader-title" onCancel={onClose}
    onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose() } }}>
    <header><h2 id="whiteboard-reader-title">协作白板</h2><div>
      <button type="button" aria-label="下载白板数据" title="下载白板数据" disabled={!board} onClick={download}><Download size={18} /></button>
      <button type="button" aria-label="关闭白板" title="关闭白板" onClick={onClose}><X size={20} /></button>
    </div></header>
    <article className="whiteboard-reader-content" dangerouslySetInnerHTML={{ __html: html }} />
  </dialog>
}
