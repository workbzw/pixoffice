# @pixoffice/renderer-pixi

Pixi scene host, actor and object views, labels, bubbles, hit testing and adapter registration. The host application supplies Pixi 8 as a peer dependency.

```ts
import { SceneView, AnimationRegistry } from '@pixoffice/renderer-pixi'
```

Supply a `SceneReadPort`, `ScenePresentationPack`, animation registry and appearance resolver. `onStep` and `dispatchCommand` are host callbacks; the renderer does not own or dispose the runtime. Call `init`, resize with the container, and call `destroy` on unmount. Do not run another runtime clock when using `onStep` to advance it.

No concrete scene or frame-player dependency. Both frame and future skeleton adapters use the same registry and `AnimationAdapter<Container>` contract. This version does not implement live appearance replacement or hot scene switching.
