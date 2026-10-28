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
    whatsappAlt: 'WhatsApp 联系二维码，扫码交流赞助合作',
    wechat: '微信',
    enlargeWechat: '放大微信二维码',
    enlargeWhatsapp: '放大 WhatsApp 二维码',
    hint: '点击二维码可放大',
    note: '开发工具 · 设计资源 · 云服务 · 独立产品',
    close: '关闭合作联系窗口',
  },
  en: {
    action: 'Advertise',
    title: 'Good products.\nThe right people.',
    description: 'Scan with WeChat or WhatsApp to discuss a partnership.',
    qrAlt: 'Author’s WeChat QR code for advertising partnerships',
    whatsappAlt: 'WhatsApp QR code for advertising partnerships',
    wechat: 'WeChat',
    enlargeWechat: 'Enlarge WeChat QR code',
    enlargeWhatsapp: 'Enlarge WhatsApp QR code',
    hint: 'Select a code to enlarge.',
    note: 'Developer tools · Design resources · Cloud services · Indie products',
    close: 'Close partnership contact',
  },
}

export function SponsorContact({ locale, wechatSrc, whatsappSrc }: { locale: 'zh' | 'en'; wechatSrc: string; whatsappSrc: string }) {
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
    <a className="site-promotion-contact" href={wechatSrc} target="_blank" rel="noopener"
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
      <div className="site-sponsor-channels">
        <figure className="site-sponsor-code">
          <a href={wechatSrc} target="_blank" rel="noopener" aria-label={t.enlargeWechat}>
            <img className="site-sponsor-qr" src={wechatSrc} width="480" height="480" alt={t.qrAlt} loading="eager" decoding="async" />
          </a>
          <figcaption>{t.wechat}</figcaption>
        </figure>
        <figure className="site-sponsor-code">
          <a href={whatsappSrc} target="_blank" rel="noopener" aria-label={t.enlargeWhatsapp}>
            <img className="site-sponsor-qr" src={whatsappSrc} width="480" height="480" alt={t.whatsappAlt} loading="eager" decoding="async" />
          </a>
          <figcaption>WhatsApp</figcaption>
        </figure>
      </div>
      <p className="site-sponsor-hint">{t.hint}</p>
      <p className="site-sponsor-note">{t.note}</p>
    </dialog>, document.body)}
  </>
}
