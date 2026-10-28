const copy = {
  zh: {
    wechat: '微信',
    wechatAlt: '微信联系二维码',
    whatsappAlt: 'WhatsApp 联系二维码',
    enlargeWechat: '放大微信二维码',
    enlargeWhatsapp: '放大 WhatsApp 二维码',
    hint: '点击二维码可放大',
  },
  en: {
    wechat: 'WeChat',
    wechatAlt: 'WeChat contact QR code',
    whatsappAlt: 'WhatsApp contact QR code',
    enlargeWechat: 'Enlarge WeChat QR code',
    enlargeWhatsapp: 'Enlarge WhatsApp QR code',
    hint: 'Select a code to enlarge.',
  },
}

export function ContactQrCodes({ locale, wechatSrc, whatsappSrc }: {
  locale: 'zh' | 'en'
  wechatSrc: string
  whatsappSrc: string
}) {
  const t = copy[locale]
  return <>
    <div className="site-contact-channels">
      <figure className="site-contact-code">
        <a href={wechatSrc} target="_blank" rel="noopener" aria-label={t.enlargeWechat}>
          <img className="site-contact-code-image" src={wechatSrc} width="480" height="480" alt={t.wechatAlt} loading="eager" decoding="async" />
        </a>
        <figcaption>{t.wechat}</figcaption>
      </figure>
      <figure className="site-contact-code">
        <a href={whatsappSrc} target="_blank" rel="noopener" aria-label={t.enlargeWhatsapp}>
          <img className="site-contact-code-image" src={whatsappSrc} width="480" height="480" alt={t.whatsappAlt} loading="eager" decoding="async" />
        </a>
        <figcaption>WhatsApp</figcaption>
      </figure>
    </div>
    <p className="site-contact-hint">{t.hint}</p>
  </>
}
