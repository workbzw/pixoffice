# @pixoffice/assets-office

Optional office asset profile. This code package contains office-specific frame validation,
semantic bindings, and the legacy work-rig preview compatibility layer. It bundles no images.

```ts
import { bindOfficeFrames } from '@pixoffice/assets-office/frame/bindings'
import { characterAssets } from '@pixoffice/assets-office/frame/resources'
import { FrameAdapter } from '@pixoffice/animation-frame'
const adapter = new FrameAdapter(manifest => characterAssets.acquire(manifest.asset.id, manifest.source.uri))
```

Use this same resource store for office scene playback and character previews. Do not load
the same textures through two independently owned stores. Configure its registry URL before
loading when using the legacy registry entry points.

`/frame/packSchema` retains the office admission rules. `/frame/workAnimation` and
`OfficeFrameSprite` retain old preview compatibility; current published office work clips
are whole-body frames. Generic frame consumers do not import this package.

Deploy images separately using the generated asset catalogs. Office furniture and each
character have independent catalogs under `public/asset-packs/`. New scenes and skeletal
assets should not depend on this office frame profile.
