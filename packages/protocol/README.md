# @pixoffice/protocol

Headless integration schemas shared by PixOffice products. Depends only on Zod;
no runtime, renderer, DOM, scene or animation dependency.

```ts
import { commandSchema, type SceneCommand } from '@pixoffice/protocol'
import { worldDirectionFromFacing } from '@pixoffice/protocol/spatial'
```

- Root: version 2.0 commands, batches, results, faults and canonical comparison keys.
- `/schema`: IDs, integer points and blocked-area primitives.
- HTTP business requests are JSON objects with a `type` identifying the operation and operation-specific parameters. Scene requests contain `teamId` and `command`. HTTP responses contain `code`, `msg` and an object-valued `data`. All protocol fields prohibit null.
- Raw-value guards run before key stripping and before serialization. `assertProtocolObject`, `parseProtocolObject`, and `stringifyProtocolObject` reject reserved keys, null, implicit-null conversions, dynamic accessors and nesting beyond 64 levels. The serializer checks the final encoded JSON too; HTTP output is independently checked after serialization.
- `stringifyDocumentObject` applies the same final JSON checks to local saves and downloads, while allowing internal optional object properties to be omitted. Null values and array holes are rejected before storage or file creation.
- `/map`: map-editing transaction schemas.
- `/spatial`: ground coordinates and cardinal world directions.
- `/dashboard`, `/chat`: optional application contracts; not required by scene products.
- `/office-integration`: office initialization, pushed snapshots, state reads, UI operations and timed user decisions. `/relay` defines scene-message routing.
- `/office-ui`: fixed whiteboard content schema and UI slot/action manifest. Remote office snapshots require a per-office `seq`; user actions use `ui.next` and `ui.respond` on the same POST endpoint.
- Empty whiteboards use a fixed default object with an empty title; `ui.next` returns `actions: []` when idle. Unknown progress and resource metrics use -1, unbound IDs use an empty string, and map bindings use `homeId: ""`.

World positions use integer ground-grid units. `Facing` represents the four
sprite-facing directions; `/spatial` converts these to world directions for
presentation. A capability's plugin owns its parameter validation. The package
provides schemas and types; the application host implements transport,
authentication and request routing.

Import schemas through the package exports listed above. The scene command
protocol version is `2.0`, the office snapshot schema version is `1.0`, and the
chat request version is `1.0`. See the [Office HTTP Integration Guide](../../integration/docs/office-integration.md)
for endpoints, request examples, response fields and error handling.
