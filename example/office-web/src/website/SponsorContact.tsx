import { useId, useRef } from 'react'
import type { MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUpRight, X } from 'lucide-react'

const copy = {
  zh: {
    action: '广告合作',
    title: '让你的产品，\n遇见同路人。',
    description: '扫码联系，聊聊你的产品与合作想法。',
    qrAlt: '作者微信联系二维码，扫码交流赞助合作',
    note: '开发工具 · 设计资源 · 云服务 · 独立产品',
    close: '关闭合作联系窗口',
  },
  en: {
    action: 'Advertise',
    title: 'Good products.\nThe right people.',
    description: 'Scan with WeChat to discuss your product and a partnership.',
    qrAlt: 'Author’s WeChat QR code for advertising partnerships',
    note: 'Developer tools · Design resources · Cloud services · Indie products',
    close: 'Close partnership contact',
  },
}

export function SponsorContact({ locale, qrSrc }: { locale: 'zh' | 'en'; qrSrc: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const id = useId()
  const t = copy[locale]

  function open(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (!dialog.current || typeof dialog.current.showModal !== 'function') return
    event.preventDefault()
    if (!dialog.current.open) dialog.current.showModal()
  }

  return <>
    <a className="site-promotion-contact" href={qrSrc} target="_blank" rel="noopener"
      aria-haspopup="dialog" aria-controls={id} onClick={open}
      data-analytics-event="promotion-open" data-analytics-promotion="partnership">
      <span>{t.action}</span><ArrowUpRight size={16} strokeWidth={1.6} aria-hidden="true" />
    </a>
    {createPortal(<dialog ref={dialog} id={id} className="site-sponsor-dialog"
      aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onClick={event => {
        if (event.target !== event.currentTarget) return
        const bounds = event.currentTarget.getBoundingClientRect()
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close()
      }}>
      <form method="dialog"><button className="site-sponsor-close" aria-label={t.close} autoFocus><X size={22} aria-hidden="true" /></button></form>
      <p className="site-sponsor-eyebrow">LET’S MAKE GOOD THINGS HAPPEN.</p>
      <h2 id={`${id}-title`}>{t.title}</h2>
      <p id={`${id}-description`} className="site-sponsor-description">{t.description}</p>
      <img className="site-sponsor-qr" src={qrSrc} width="928" height="928" alt={t.qrAlt} loading="lazy" />
      <p className="site-sponsor-note">{t.note}</p>
    </dialog>, document.body)}
  </>
}
