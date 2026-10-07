# @pixoffice/renderer-pixi

Pixi scene host, actor and object views, labels, bubbles, hit testing and adapter registration. The host application supplies Pixi 8 as a peer dependency.

```ts
import { SceneView, AnimationRegistry } from '@pixoffice/renderer-pixi'
```

Supply a `SceneReadPort`, `ScenePresentationPack`, animation registry and appearance resolver. `onStep` and `dispatchCommand` are host callbacks; the renderer does not own or dispose the runtime. Call `init`, resize with the container, and call `destroy` on unmount. Do not run another runtime clock when using `onStep` to advance it.

No concrete scene or frame-player dependency. Both frame and future skeleton adapters use the same registry and `AnimationAdapter<Container>` contract. This version does not implement live appearance replacement or hot scene switching.

For managed assembly, use `mountScene(element, async signal => assembly, { signal })`.
`SceneAssembly` supplies `scene`, `pack`, `animations`, and `resolveAppearance`.
Unlike a directly constructed `SceneView`, the returned mount owns its runtime and view;
its idempotent `dispose()` releases both. The mount handles resizing, cancellation and
initialization errors. It advances the runtime only through the view's clock.
`createAppearanceResolver` loads only requested URLs and resolves relative source URIs.
