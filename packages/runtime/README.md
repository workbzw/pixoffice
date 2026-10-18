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

Stateful templates can provide `initialState` for newly placed objects. Plugins can enforce scene-owned structural requirements with `validateWorld`; these and object state schemas are checked at startup, checkpoint restore and map edits. Structural failures reject a draft change atomically, while geometric errors can remain editable.

History is bounded to 512 records, with two slots reserved for immediate stop/cancel commands. Controls cannot wait on unfinished dependencies and remain available after a storage failure; ordinary new work stays blocked. `completedActivityCount` counts successful finite activities for the current runtime lifetime, independently of history pruning, and is not a durable business metric.

Browser storage, message routing and SSE are explicit subpath exports; the root is safe to import without a browser. A scene completion event describes scene execution, not whether an external AI task was successful.

Browser checkpoints use `pixoffice:<product>:runtime:v2:<sceneId>` (`classic` by default). Only version-2 checkpoints and protocol-2.0 command records restore. Retired storage keys, archived command formats and scene-specific migration hooks are removed; current-format validation and explicit layout recovery remain available.

Checkpoint activity metadata uses the same 512-entry bound as command history, not the 128-entry pending-work limit. Restore rejects duplicate identities, cross-scene commands and mismatched activity references without overwriting the original. Scene notifications may stop or dispose the runtime; interrupted phases stop applying effects, and map changes are announced only after their command is completed.

The message client routes by team ID into existing SceneRuntime queues. SSE is an explicit transport adapter; it owns no execution queue. One browser application shares one stream for its registered teams. Switching views does not destroy queues; disconnecting does not cancel accepted activities. There are no receipts, execution uploads, leases or replay cursors. Static demos create no transport. See [message relay deployment](../../integration/docs/message-relay.md) for the optional single-process Fastify host.
