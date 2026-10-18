# PixOffice Farm

Two farmers, six integer-grid vegetable beds, carrots/tomatoes/cabbages, manual operations, optional automatic tending, pause, 1x/4x growth and local persistence. Offline growth is intentionally paused. Farmers currently share one original character appearance and use independent animation instances.

From the repository root:

```sh
npm install
npm run dev:farm
npm run build:farm
```

The full website also serves `/farm/`. The standalone build contains only farm assets and rejects imports from office/classroom packages.

For external driving, use the shared Fastify POST + SSE relay with team ID `farm`. Root `npm run dev` enables the connection; `npm run dev:vite` and static hosting remain local demos. The same frontend build is used in Docker, with runtime configuration. Automatic tending is disabled when a relay is configured. See [message relay deployment](../../docs/message-relay.md).

```json
{
  "protocolVersion": "2.0",
  "sceneId": "farm",
  "commandId": "plant-001",
  "type": "activity.start",
  "capability": "farm.plant",
  "participants": [{ "entityId": "farmer-1", "role": "farmer" }],
  "params": { "plotId": "plot-1", "crop": "carrot" }
}
```

After completion, use `farm.water`; harvest with `farm.harvest` only after `cropStatus()` reports `ready`. Successful harvest commits the plot and inventory as one validated change set. Reuse an identical command ID for transport retries; do not invent a new command ID for the same retry.

Persistence key: `pixoffice:farm:v2`. Saves include the runtime checkpoint and logical growth time. Only current version-2 envelopes with layout version 2 are read; retired keys and layout migration are removed. Interrupted operations fail explicitly after reload and are not replayed automatically. Invalid saves are left untouched and the page runs a temporary farm instead.
