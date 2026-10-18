# @pixoffice/renderer-pixi

Pixi scene host, actor and object views, labels, bubbles, hit testing and adapter registration. The host application supplies Pixi 8 as a peer dependency.

```ts
import { SceneView, AnimationRegistry } from '@pixoffice/renderer-pixi'
```

Supply a `SceneReadPort`, `ScenePresentationPack`, animation registry and appearance resolver. `onStep` and `dispatchCommand` are host callbacks; the renderer does not own or dispose the runtime. Call `init`, resize with the container, and call `destroy` on unmount. Do not run another runtime clock when using `onStep` to advance it.

A view is single-use: concurrent `init` calls share one initialization promise. Initialization failures destroy that view's canvas and resources; create a new view to retry. `destroy()` is idempotent, isolates cleanup failures and stops any remaining work in the current frame. It never disposes an externally owned runtime.

No concrete scene or frame-player dependency. Both frame and future skeleton adapters use the same registry and `AnimationAdapter<Container>` contract. This version does not implement live appearance replacement or hot scene switching.

Scene packs may optionally provide `createAmbientViews(runtime)` for decorative wildlife or effects. Each view supplies Pixi `roots`, `update(elapsedSeconds, world)`, and optional `dispose()`. The renderer mounts them in the shared depth-sorted world layer and uses the existing ticker, with zero elapsed time during editor previews. Ambient views own no actor commands or worker reservations; scene-specific clocks and behavior stay inside their scene pack.

For managed assembly, use `mountScene(element, async signal => assembly, { signal })`.
`SceneAssembly` supplies `scene`, `pack`, `animations`, and `resolveAppearance`.
Unlike a directly constructed `SceneView`, the returned mount owns its runtime and view;
its idempotent `dispose()` releases both. The mount handles resizing, cancellation and
initialization errors. It advances the runtime only through the view's clock.
`createAppearanceResolver` loads only requested URLs and resolves relative source URIs.

`ScenePresentationPack.projection` supplies the coordinate boundary. Built-ins are
`createOrthogonalProjection(cellPixels)` and `createDimetricProjection(tileWidth)`
(exact 2:1 tiles). Missing projection preserves the old square mapping.
`SceneView.screenToCell` consumes canvas CSS coordinates; `onCellClick` reports a
ground cell after undoing viewport translation and scaling. `contentBounds` can
reserve space for artwork above or beyond the ground plane. `rendering` controls
antialiasing, pixel alignment and pixel-art CSS sampling without changing runtime.

An optional `SceneAssembly.product` enforces the selected presentation profile
when resolving character assets. It does not migrate storage or choose a scene.
See `example/dimetric` for a separate build with no classic scene/asset imports.
