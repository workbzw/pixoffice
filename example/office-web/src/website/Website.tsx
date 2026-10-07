import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUpRight, Blocks, BookOpen, Check, Code2, Copy, GitFork, GraduationCap, Layers3, Menu, MessageCircle, Monitor, Move, Plug, Terminal, X } from 'lucide-react'
import { websiteContent, websiteReadme, websiteRepository as repository, websiteSnippets } from './content.ts'
import { readWebsiteLocale, rememberWebsiteLocale, type WebsiteLocale } from './locale.ts'

const base = import.meta.env.BASE_URL
const docs = `${repository}/blob/main/docs/architecture/README.md`
const features = [
  { key: 'collaboration', icon: MessageCircle, tone: 'coral' },
  { key: 'layout', icon: Move, tone: 'green' },
  { key: 'integration', icon: Plug, tone: 'blue' },
] as const

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
        <nav id="site-navigation" aria-label={t.nav.label} className={menuOpen ? 'site-nav is-open' : 'site-nav'} onClick={() => setMenuOpen(false)}>
          <a href={homeHref} aria-current="page">{t.nav.home}</a>
          <a href={`${base}office/`}>{t.nav.office} <ArrowUpRight size={13} /></a>
          <a href={`${base}minimal/`}>{t.nav.minimal} <ArrowUpRight size={13} /></a>
          <a href={`${base}classroom/`}>{t.nav.classroom} <ArrowUpRight size={13} /></a>
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
      <section className="site-hero" aria-labelledby="hero-title">
        <div className="site-hero-copy">
          <p className="site-eyebrow"><span /> {t.hero.eyebrow}</p>
          <h1 id="hero-title">PixOffice<span>.</span></h1>
          <p className="site-tagline">{t.hero.tagline}</p>
          <p className="site-hero-description">{t.hero.description}</p>
          <div className="site-actions">
            <a className="site-button site-button-primary" href={`${base}office/`}>{t.hero.primary} <ArrowRight size={17} /></a>
            <a className="site-button site-button-secondary" href={`${base}minimal/`}><Blocks size={17} /> {t.hero.secondary}</a>
          </div>
        </div>
        <img className="site-hero-scene" src={`${base}site/office-scene.webp`} width="734" height="566" fetchPriority="high" alt={t.hero.alt} />
        <div className="site-hero-bottom"><span>{t.hero.caption}</span><a href="#overview" aria-label={t.hero.learn}><ArrowDown size={17} /></a><span>React + PixiJS</span></div>
      </section>

      <section id="overview" className="site-overview site-section">
        <div className="site-container">
          <div className="site-section-heading"><div><p className="site-eyebrow">{t.overview.eyebrow}</p><h2>{t.overview.title}</h2></div><p>{t.overview.description}</p></div>
          <div className="site-features">
            {features.map(({ key, icon: Icon, tone }, index) => <article key={key}><Icon className={`site-feature-icon ${tone}`} size={25} /><span className="site-number">0{index + 1}</span><h3>{t.features[key].title}</h3><p>{t.features[key].description}</p></article>)}
          </div>
        </div>
      </section>

      <section id="examples" className="site-examples site-section">
        <div className="site-container">
          <div className="site-section-heading"><div><p className="site-eyebrow">{t.examples.eyebrow}</p><h2>{t.examples.title}</h2></div><p>{t.examples.description}</p></div>
          <div className="site-example-grid">
            <a className="site-example" href={`${base}office/`}>
              <div className="site-example-image"><img src={`${base}site/office-preview.webp`} width="1200" height="750" loading="lazy" alt={t.examples.office.alt} /></div>
              <div className="site-example-copy"><span className="site-example-label"><Monitor size={15} /> {t.examples.office.label}</span><h3>{t.nav.office} <ArrowUpRight size={23} /></h3><p>{t.examples.office.description}</p><span className="site-text-link">{t.examples.office.action} <ArrowRight size={16} /></span></div>
            </a>
            <a className="site-example" href={`${base}classroom/`}>
              <div className="site-example-image"><img src={`${base}site/classroom-preview.webp`} width="1210" height="729" loading="lazy" alt={t.examples.classroom.alt} /></div>
              <div className="site-example-copy"><span className="site-example-label"><GraduationCap size={15} /> {t.examples.classroom.label}</span><h3>{t.nav.classroom} <ArrowUpRight size={23} /></h3><p>{t.examples.classroom.description}</p><span className="site-text-link">{t.examples.classroom.action} <ArrowRight size={16} /></span></div>
            </a>
            <a className="site-example" href={`${base}minimal/`}>
              <div className="site-example-image minimal"><img src={`${base}site/office-scene.webp`} width="734" height="566" loading="lazy" alt={t.examples.minimal.alt} /></div>
              <div className="site-example-copy"><span className="site-example-label"><Blocks size={15} /> {t.examples.minimal.label}</span><h3>{t.nav.minimal} <ArrowUpRight size={23} /></h3><p>{t.examples.minimal.description}</p><span className="site-text-link">{t.examples.minimal.action} <ArrowRight size={16} /></span></div>
            </a>
          </div>
          <p className="site-example-note">{t.examples.note}</p>
        </div>
      </section>

      <section className="site-architecture site-section">
        <div className="site-container">
          <div className="site-section-heading"><div><p className="site-eyebrow">{t.architecture.eyebrow}</p><h2>{t.architecture.title}</h2></div><a className="site-text-link" href={docs} target="_blank" rel="noreferrer">{t.architecture.action} <ArrowUpRight size={17} /></a></div>
          <div className="site-module-grid">{Object.entries(t.modules).map(([name, { title, description }], index) => <a key={name} href={`${repository}/tree/main/packages/${name}`} target="_blank" rel="noreferrer"><span>0{index + 1}<ArrowUpRight size={15} /></span><h3>{title}</h3><code>{name}</code><p>{description}</p></a>)}</div>
          <p className="site-architecture-note"><Layers3 size={17} /> {t.architecture.note}</p>
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

    <footer className="site-footer"><div className="site-container"><a className="site-brand" href={homeHref} aria-label={t.nav.returnHome}><img src={`${base}site/wordmark.webp`} width="480" height="160" loading="lazy" alt="PixOffice" /></a><p>{t.footer.tagline}</p><nav aria-label={t.footer.resources}><a href={readmeHref} target="_blank" rel="noreferrer">GitHub</a><a href={docs} target="_blank" rel="noreferrer">{t.nav.docs}</a><a href={`${base}LICENSE.txt`} target="_blank" rel="noreferrer">{t.footer.license}</a><a href={`${base}THIRD_PARTY_NOTICES.txt`} target="_blank" rel="noreferrer">{t.footer.notices}</a></nav></div></footer>
  </div>
}
