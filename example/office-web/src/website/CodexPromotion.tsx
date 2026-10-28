import { ArrowUpRight } from 'lucide-react'
import { SponsorContact } from './SponsorContact.tsx'

export function CodexPromotion({ label, title, locale }: { label: string; title: string; locale: 'zh' | 'en' }) {
  return <div className="site-promotion" role="group" aria-label={label}>
    <span className="site-promotion-label">{label}</span>
    <a className="site-promotion-link" href="https://aivojet.link/" target="_blank" rel="sponsored noopener" data-analytics-event="codex-ad-click">
      <span>{title}</span><ArrowUpRight size={18} strokeWidth={1.6} aria-hidden="true" />
    </a>
    <SponsorContact locale={locale} wechatSrc={`${import.meta.env.BASE_URL}site/sponsor-wechat.png`} whatsappSrc={`${import.meta.env.BASE_URL}site/sponsor-whatsapp.png`} />
  </div>
}
