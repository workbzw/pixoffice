import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ArrowUpRight, Blocks, BookOpen, Check, Code2, Copy, GitFork, GraduationCap, Landmark, Menu, MessageCircle, Monitor, Sprout, Terminal, X } from 'lucide-react'
import { websiteContent, websiteReadme, websiteRepository as repository, websiteSnippets } from './content.ts'
import { readWebsiteLocale, rememberWebsiteLocale, type WebsiteLocale } from './locale.ts'
import { CodexPromotion } from './CodexPromotion.tsx'

const base = import.meta.env.BASE_URL
const docs = `${repository}/blob/main/docs/architecture/README.md`

export function Website() {
  const [locale, setLocale] = useState(readWebsiteLocale)
  const t = websiteContent[locale]
  const snippets = websiteSnippets(locale)
  const homeHref = `${base}?lang=${locale}`
  const readmeHref = websiteReadme(locale)
  const [menuOpen, setMenuOpen] = useState(false)
  const [snippet, setSnippet] = useState<keyof typeof snippets>('start')
  const [copyStatus, setCopyStatus] = useState<'success' | 'error' | null>(null)
  const menuButton = useRef<HTMLButtonElement>(null)
  const contactDialog = useRef<HTMLDialogElement>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(copyTimer.current), [])
  useEffect(() => {
    const syncLocale = () => { setLocale(readWebsiteLocale()); setCopyStatus(null) }
    window.addEventListener('popstate', syncLocale)
    return () => window.removeEventListener('popstate', syncLocale)
  }, [])
  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
    document.title = t.meta.title
    for (const [selector, content] of [
      ['meta[name="description"]', t.meta.description],
      ['meta[property="og:title"]', t.meta.title],
      ['meta[property="og:description"]', t.meta.socialDescription],
      ['meta[property="og:locale"]', locale === 'zh' ? 'zh_CN' : 'en_US'],
    ]) document.querySelector(selector)?.setAttribute('content', content)
  }, [locale, t])

  function changeLocale(next: WebsiteLocale) {
    setLocale(next)
    setCopyStatus(null)
    rememberWebsiteLocale(next)
  }

  function openContact() {
    if (menuOpen) menuButton.current?.focus()
    contactDialog.current?.showModal()
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippets[snippet])
      setCopyStatus('success')
    } catch {
      setCopyStatus('error')
    }
    clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopyStatus(null), 3000)
  }

  return <div className="site">
    <a className="site-skip" href="#main">{t.nav.skip}</a>
    <header className="site-header" onKeyDown={event => {
      if (event.key === 'Escape' && menuOpen) { setMenuOpen(false); menuButton.current?.focus() }
    }}>
      <div className="site-header-inner">
        <a className="site-brand" href={homeHref} aria-label={t.nav.homeLabel}><img src={`${base}site/wordmark.webp`} width="480" height="160" alt="PixOffice" /></a>
        <CodexPromotion label={t.promotion.label} title={t.promotion.title} locale={locale} />
        <nav id="site-navigation" aria-label={t.nav.label} className={menuOpen ? 'site-nav is-open' : 'site-nav'} onClick={() => setMenuOpen(false)}>
          <a href={homeHref} aria-current="page">{t.nav.home}</a>
          <button type="button" onClick={openContact}><MessageCircle size={15} /> {t.contact.action}</button>
          <a href={docs} target="_blank" rel="noreferrer">{t.nav.docs}</a>
          <a className="site-github" href={readmeHref} target="_blank" rel="noreferrer"><GitFork size={17} /> GitHub <ArrowUpRight size={13} /></a>
        </nav>
        <div className="site-header-tools">
          <div className="site-languages" role="group" aria-label={t.nav.language}>
            <button type="button" lang="zh-CN" aria-label="切换到中文" aria-pressed={locale === 'zh'} onClick={() => changeLocale('zh')}>中文</button>
            <button type="button" lang="en" aria-label="Switch to English" aria-pressed={locale === 'en'} onClick={() => changeLocale('en')}>EN</button>
          </div>
          <button ref={menuButton} type="button" className="site-menu-toggle" aria-label={menuOpen ? t.nav.closeMenu : t.nav.openMenu} aria-expanded={menuOpen} aria-controls="site-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>
        </div>
      </div>
    </header>

    <main id="main">
      <section id="examples" className="site-examples site-section" aria-labelledby="scenes-title">
        <div className="site-container">
          <div className="site-scene-heading"><h1 id="scenes-title">{t.examples.title}</h1><p>{t.examples.description}</p></div>
          <div className="site-example-grid">
            <a className="site-example" href={`${base}office/`}>
              <div className="site-example-image"><img src={`${base}site/office-preview.webp`} width="1200" height="750" fetchPriority="high" alt={t.examples.office.alt} /></div>
              <div className="site-example-copy"><span className="site-example-label"><Monitor size={15} /> {t.examples.office.label}</span><h3>{t.nav.office} <ArrowUpRight size={23} /></h3><p>{t.examples.office.description}</p><span className="site-text-link">{t.examples.office.action} <ArrowRight size={16} /></span></div>
            </a>
            <a className="site-example" href={`${base}classroom/`}>
              <div className="site-example-image"><img src={`${base}site/classroom-preview.webp`} width="1210" height="729" alt={t.examples.classroom.alt} /></div>
              <div className="site-example-copy"><span className="site-example-label"><GraduationCap size={15} /> {t.examples.classroom.label}</span><h3>{t.nav.classroom} <ArrowUpRight size={23} /></h3><p>{t.examples.classroom.description}</p><span className="site-text-link">{t.examples.classroom.action} <ArrowRight size={16} /></span></div>
            </a>
            <a className="site-example" href={`${base}minimal/`}>
              <div className="site-example-image minimal"><img src={`${base}site/office-scene.webp`} width="734" height="566" alt={t.examples.minimal.alt} /></div>
              <div className="site-example-copy"><span className="site-example-label"><Blocks size={15} /> {t.examples.minimal.label}</span><h3>{t.nav.minimal} <ArrowUpRight size={23} /></h3><p>{t.examples.minimal.description}</p><span className="site-text-link">{t.examples.minimal.action} <ArrowRight size={16} /></span></div>
            </a>
            <a className="site-example" href={`${base}farm/`}>
              <div className="site-example-image"><img src={`${base}site/farm-preview.webp`} width="1200" height="900" loading="lazy" alt={t.examples.farm.alt} /></div>
              <div className="site-example-copy"><span className="site-example-label"><Sprout size={15} /> {t.examples.farm.label}</span><h3>{t.nav.farm} <ArrowUpRight size={23} /></h3><p>{t.examples.farm.description}</p><span className="site-text-link">{t.examples.farm.action} <ArrowRight size={16} /></span></div>
            </a>
            <a className="site-example" href={`${base}civic/`}>
              <div className="site-example-image"><img src={`${base}site/civic-preview.webp`} width="1440" height="1050" loading="lazy" alt={t.examples.civic.alt} /></div>
              <div className="site-example-copy"><span className="site-example-label"><Landmark size={15} /> {t.examples.civic.label}</span><h3>{t.nav.civic} <ArrowUpRight size={23} /></h3><p>{t.examples.civic.description}</p><span className="site-text-link">{t.examples.civic.action} <ArrowRight size={16} /></span></div>
            </a>
            <article id="customization" className="site-contact-card">
              <div className="site-contact-preview">
                <button className="site-qr-button" type="button" aria-label={t.contact.enlarge} title={t.contact.enlarge} onClick={openContact}>
                  <img src={`${base}site/customization-contact.jpg`} width="638" height="637" loading="lazy" alt={t.contact.qrAlt} />
                </button>
              </div>
              <div className="site-example-copy">
                <span className="site-example-label"><MessageCircle size={15} /> {t.contact.label}</span>
                <h2>{t.contact.title}</h2>
                <p>{t.contact.description}</p>
                <button className="site-text-link" type="button" onClick={openContact}>{t.contact.action} <ArrowUpRight size={16} /></button>
              </div>
            </article>
          </div>
          <p className="site-example-note">{t.examples.note}</p>
        </div>
      </section>

      <section id="getting-started" className="site-start site-section">
        <div className="site-container site-start-grid">
          <div><p className="site-eyebrow">{t.developer.eyebrow}</p><h2>{t.developer.title}</h2><p>{t.developer.description}</p><a className="site-text-link" href={`${repository}/blob/main/docs/plugin-runtime.md`} target="_blank" rel="noreferrer"><BookOpen size={17} /> {t.developer.action} <ArrowUpRight size={16} /></a><small className="site-docs-note">{t.developer.docsNote}</small></div>
          <div className="site-code-panel">
            <div className="site-code-toolbar">
              <div role="tablist" aria-label={t.code.label}>{(['start', 'action'] as const).map(id => <button key={id} role="tab" id={`tab-${id}`} aria-controls="code-example" aria-selected={snippet === id} tabIndex={snippet === id ? 0 : -1} type="button" onClick={() => { setSnippet(id); setCopyStatus(null) }} onKeyDown={event => {
                if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 'start' : event.key === 'End' ? 'action' : id === 'start' ? 'action' : 'start'; setSnippet(next); setCopyStatus(null); document.getElementById(`tab-${next}`)?.focus() }
              }}>{id === 'start' ? <Terminal size={15} /> : <Code2 size={15} />}{t.code[id]}</button>)}</div>
              <button className="site-copy" type="button" aria-label={t.code.copy} title={t.code.copy} onClick={() => void copy()}>{copyStatus === 'success' ? <Check size={17} /> : <Copy size={17} />}</button>
            </div>
            <pre id="code-example" role="tabpanel" aria-labelledby={`tab-${snippet}`} tabIndex={0}><code>{snippets[snippet]}</code></pre>
            <div className="site-code-footer"><span>{snippet === 'start' ? 'Node.js · npm workspaces' : t.code.gateway}</span><span role="status">{copyStatus ? t.code[copyStatus] : ''}</span></div>
          </div>
        </div>
      </section>
    </main>

    <dialog ref={contactDialog} className="site-contact-dialog" aria-labelledby="contact-title" aria-describedby="contact-description" onClick={event => {
      if (event.target === event.currentTarget) contactDialog.current?.close()
    }}>
      <div className="site-contact-dialog-content">
        <div className="site-contact-dialog-heading">
          <h2 id="contact-title">{t.contact.dialogTitle}</h2>
          <form method="dialog"><button className="site-contact-close" aria-label={t.contact.close} title={t.contact.close}><X size={20} /></button></form>
        </div>
        <p id="contact-description">{t.contact.description}</p>
        <img className="site-contact-qr" src={`${base}site/customization-contact.jpg`} width="638" height="637" alt={t.contact.qrAlt} />
        <p className="site-contact-channel">{t.contact.channel}</p>
      </div>
    </dialog>

    <footer className="site-footer">
      <div className="site-container"><a className="site-brand" href={homeHref} aria-label={t.nav.returnHome}><img src={`${base}site/wordmark.webp`} width="480" height="160" loading="lazy" alt="PixOffice" /></a><p>{t.footer.tagline}</p><nav aria-label={t.footer.resources}><a href={readmeHref} target="_blank" rel="noreferrer">GitHub</a><a href={docs} target="_blank" rel="noreferrer">{t.nav.docs}</a><a href={`${base}LICENSE.txt`} target="_blank" rel="noreferrer">{t.footer.license}</a><a href={`${base}THIRD_PARTY_NOTICES.txt`} target="_blank" rel="noreferrer">{t.footer.notices}</a></nav></div>
      <div id="website-filings" className="site-container site-legal" aria-label={t.footer.filing}>
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">京ICP备2022031958号-5</a>
        <a href="https://beian.mps.gov.cn/#/query/webSearch?code=11011402013434" target="_blank" rel="noopener noreferrer"><img src={`${base}site/public-security.png`} width="20" height="20" alt="" /><span>京公网安备11011402013434号</span></a>
      </div>
    </footer>
  </div>
}
