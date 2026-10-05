# @pixoffice/runtime

Headless integer-grid world, navigation, interaction phases, resource reservations, cancellation, protocol validation and map transactions. No office, animation, React or Pixi dependency.

```ts
import { createSceneRuntime } from '@pixoffice/runtime'
const runtime = createSceneRuntime(myScenePack)
runtime.submit(command) // protocolVersion: '2.0'
runtime.tick(50)        // milliseconds; one clock owned by the host
runtime.dispose()
```

Implement `ScenePack` / `ScenePlugin` for domain-specific furniture and activities. `SceneReadPort` is the read-only interface consumed by views. Navigation remains an injectable `NavigationAdapter` inside this package, not an extra npm dependency.

Browser storage, HTTP and iframe bridges are explicit subpath exports; the root is safe to import without a browser. A scene completion event describes scene execution, not whether an external AI task was successful.
