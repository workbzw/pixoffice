(() => {
  const config = window.SITE_ANALYTICS;
  const trackingId = typeof config?.trackingId === 'string' ? config.trackingId.trim() : '';
  if (!config?.enabled || !/^[a-f0-9]{32}$/i.test(trackingId)) return;
  if (!Array.isArray(config.domains) || !config.domains.includes(location.hostname)) return;
  if (document.getElementById('site-baidu')) return;

  const pagePath = () => location.pathname + location.search + (config.hashRouting ? location.hash : '');
  const initialPath = pagePath();
  let lastPath = initialPath;
  let ready = false;
  let failed = false;
  const pending = [];

  window._hmt = window._hmt || [];
  const send = (command) => {
    try {
      window._hmt.push(command);
    } catch {
      // Analytics must not affect links, dialogs or the demo itself.
    }
  };
  const track = (command) => {
    if (failed) return;
    if (ready) send(command);
    else {
      // Buffer at most 20 actions in memory while the async SDK loads.
      if (pending.length === 20) pending.shift();
      pending.push(command);
    }
  };

  // Disable the SDK's automatic PV so the explicit initial view is counted once.
  // Keep the same path format for PlantBox's initial and hash-route pageviews.
  send(['_setAutoPageview', false]);
  const script = document.createElement('script');
  script.id = 'site-baidu';
  script.src = `https://hm.baidu.com/hm.js?${trackingId}`;
  script.async = true;
  script.addEventListener('load', () => {
    ready = true;
    send(['_trackPageview', initialPath]);
    for (const command of pending.splice(0)) send(command);
  }, { once: true });
  script.addEventListener('error', () => {
    failed = true;
    pending.length = 0;
  }, { once: true });

  const trackClick = (event) => {
    if (event.type === 'click' && event.button !== 0) return;
    if (event.type === 'auxclick' && event.button !== 1) return;
    const target = event.target instanceof Element ? event.target.closest('[data-analytics-event]') : null;
    if (!target) return;
    const action = target.dataset.analyticsEvent;
    const label = target.dataset.analyticsPromotion || target.dataset.analyticsProject ||
      (action === 'codex-ad-click' ? 'codex-discount' : '');
    track(['_trackEvent', config.site || location.hostname, action, label]);
  };
  document.addEventListener('click', trackClick, { capture: true, passive: true });
  document.addEventListener('auxclick', trackClick, { capture: true, passive: true });
  if (config.hashRouting) {
    window.addEventListener('hashchange', () => {
      const path = pagePath();
      if (path === lastPath) return;
      lastPath = path;
      track(['_trackPageview', path]);
    });
  }
  document.head.appendChild(script);
})();
