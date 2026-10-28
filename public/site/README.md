# Website Media

- `office-scene.webp`: screenshot of the running minimal office example, captured without browser chrome or navigation.
- `office-preview.webp`: optimized copy of the existing `docs/page-preview.jpeg` product screenshot.
- `classroom-preview.webp`: screenshot of the running classroom example with enlarged characters and furniture, captured from `/classroom/`.
- `wordmark.webp`: reduced-size web copy of the selected `public/brand/title.png` brand asset.
- `icon.png`: small browser icon derived from the selected `public/brand/logo.png` mascot.
- `public-security.png`: official public-security filing icon, copied from the HelloWorld homepage asset and originally downloaded from <https://beian.mps.gov.cn/img/ghs.png>. The website footer displays 京ICP备2022031958号-5 and 京公网安备11011402013434号, with links to the MIIT filing system and the matching public-security record. This icon is included in the website release asset list.
- `sponsor-wechat.png` / `sponsor-whatsapp.png`: optimized 480×480 contact QR images (33,284 / 15,523 bytes), shared with HelloWorld and PlantBox. WeChat comes from `docs/wechat-qr.png`; WhatsApp comes from the user-provided QR image. Both are included in the release asset list. The localized partnership dialog shows both channels, loads the small images eagerly, and supports click-to-enlarge, close, Escape, backdrop dismissal, and focus return. Modified partnership-link clicks open the WeChat image directly. Offline decoding confirms the compressed images preserve the original QR payloads.

These assets reuse the project's existing artwork. The website does not load the scene runtime or character atlases.

## Baidu analytics

`analytics-config.js` and `analytics.js` are included in the website release. The configured Baidu property is `pixoffice.helloworld.today` (dashboard site ID `23639935`). The public 32-character `trackingId` comes from the property's `hm.js?` code and is enabled for that production hostname only. Local previews do not load the SDK or send data. Rebuild and deploy to start collecting real visits; account/property creation alone does not publish the code. Serve the configuration with `Cache-Control: no-cache`, refresh changed CDN resources, and never add account passwords or API tokens. Set `enabled: false` to disable tracking.

The Codex link records `_trackEvent` with category `pixoffice`, action `codex-ad-click`, label `codex-discount`. The partnership link records category `pixoffice`, action `promotion-open`, label `partnership`. Select this website in Baidu and view the event analysis report. All six published HTML entries (home, office, minimal, classroom, farm, and civic) load the same configuration and runtime before `</head>`. Each page counts its initial pageview once; clicks do not count as pageviews. The character-lab development page is outside the published website build. Left clicks, keyboard activation and middle clicks are observed without delaying navigation or changing dialog behavior. At most 20 pending actions are buffered in memory while the SDK loads; a blocked or unavailable SDK does not break the site.

HelloWorld and PlantBox have their own Baidu properties and signatures, with matching action/label conventions and their respective categories. Outbound clicks are recorded, not destination purchases or registrations. Data starts after deploying this build and has no historical backfill. Baidu's code page advises allowing approximately 20 minutes after installation for reports to appear.
