# @pixoffice/animation-frame

Existing full-image frame animation as a Pixi adapter. Preserves frame timing, mouth layers, proportions and prepared action resources. Requires the host's Pixi 8 peer.

```ts
import { FrameAdapter } from '@pixoffice/animation-frame'
animations.register(new FrameAdapter())
```

Assets select `adapterId: 'pixoffice.frame'` and `source.format: 'pixoffice-frame-v1'`. `source.uri` points to the character manifest; bindings map semantic variants to authored clips. No image assets are bundled in this code package.

Use a URI-resolving appearance resolver, or configure the optional character registry with `configureCharacterResources(baseUrl)` before loading. A custom resource-acquisition callback can be passed to the constructor. Leases share resources while visual instances keep independent clocks; never destroy shared textures from an instance.

Supports complete body frames plus an optional mouth layer. Dynamic contact retargeting, arbitrary gesture mixing and IK are not implemented; unsupported combinations fail explicitly.
