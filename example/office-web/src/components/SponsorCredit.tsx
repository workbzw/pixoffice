import './SponsorCredit.css'

export function SponsorCredit({ locale = 'zh', compact = false }: { locale?: 'zh' | 'en'; compact?: boolean }) {
  return <span className={`sponsor-credit${compact ? ' sponsor-credit-compact' : ''}`} role="group"
    aria-label={locale === 'en' ? 'Sponsored by KunlunMeta' : '由 KunlunMeta 赞助支持'}>
    <span className="sponsor-credit-label">{locale === 'en' ? 'Sponsored by' : '赞助支持'}</span>
    <img src={`${import.meta.env.BASE_URL}brand/kunlunmeta.png`} width={2593} height={534} alt="KunlunMeta" />
  </span>
}
