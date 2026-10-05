# @pixoffice/contracts

Renderer-neutral animation and presentation contracts with Zod validation. No React, Pixi or runtime dependency.

```ts
import type { AnimationAdapter, VisualAssetManifest } from '@pixoffice/contracts'
import { visualAssetManifestSchema } from '@pixoffice/contracts'
```

An adapter acquires an asset lease, prepares supported action combinations, creates independent visual instances, samples the host clock, exposes sockets and disposes its own resources. It must not move world entities or report business completion.

Coordinates are local display units (standing reference height = 1), ground root at (0, 0), x right, y down. API version 1. The current renderer contract is `pixi-1`; use `AnimationAdapter<Container>` in Pixi hosts. See the repository's `docs/architecture/extension-contracts.md` for lifecycle and acceptance requirements.
