# PixOffice

[简体中文](./README.md) · **English**

[Website: pixoffice.online](https://pixoffice.online/?lang=en)

[Full Office](https://pixoffice.online/office/) · [Minimal Example](https://pixoffice.online/minimal/)

![PixOffice demo: characters walking and talking at workstations](./docs/office-demo.gif)

A demo of the current scene: multiple characters walking, visiting desks, and talking. [View the high-resolution screenshot](./docs/page-preview.jpeg).

PixOffice is a standalone 2D office frontend built with Vite, React, and PixiJS. Replaceable business data sources provide metrics, tasks, and employee information. The scene runtime drives characters, objects, and activities through a versioned protocol and trusted built-in plugins. Without a connected business service, the interface uses clearly labeled sample data.

It includes character frame animations, seated poses, and office assets, with support for desk visits, group meetings, sustained focus, whiteboard content, plugin controls, and grid-based drag-and-drop layouts.

Maps and character movement use integer grid cells: characters occupy 1×1 cell, desk-and-chair sets 2×2 cells, and whiteboards 2×1 cells. Furniture interactions use entrance cells, use cells, and resource reservations. Smooth motion is interpolated only in the rendering layer. The current command protocol is `2.0`; see [Integer Grid and Furniture Interactions](./docs/integer-grid-and-interactions.md).

[Dashboard Data Integration](./docs/dashboard-integration.md) · [Plugins, Scene Protocol, and External Integration](./docs/plugin-runtime.md) · [Map Editor and AI Editing Protocol](./docs/map-editor.md) · [Long-Term Protocol Draft](./docs/scene-protocol-v1.md)

[Scene Extensions and Animation Architecture](./docs/architecture/README.md) covers the office scene package, frame animation adapter, public integration interfaces, and future migration boundaries. Classroom scenes and skeletal animation engines are not implemented yet.

The website supports Chinese and English. The example interfaces, screenshots, and linked technical documentation are currently in Chinese.

## Packages and Examples

The project uses npm workspaces. Five packages define the main boundaries: `contracts` for shared contracts, `runtime` for the core runtime, `renderer-pixi` for the rendering host, `animation-frame` for frame playback, and `scene-office` for the office scene.

- [Full Office](./example/office-web): the React interface, chat, editor, and HTTP integration.
- [Minimal Example](./example/minimal-vanilla): an office assembled only through public package exports, without React.
- [Architecture and Responsibilities](./docs/architecture/README.md): dependency direction, asset delivery, and entry points for scene and skeletal animation development.

Use `npm run packages:build` to build the packages, `npm run packages:check` to check boundaries, and `npm run packages:smoke` to install the packaged tarballs outside the repository for validation. The code packages are developed within this repository and have not been published to npm. Assets are deployed separately and can be exported with `npm run assets:export -- /absolute/path/to/new-public-directory`.

## Office Chat

A floating input sits at the bottom of the animated scene. Sending a message expands the conversation panel upward. An animated multicolor border indicates generation, with controls to stop, collapse, or start a new conversation. By default, this is a clearly labeled interaction preview: it does not call a model or execute tasks. Connect a real streaming service through `VITE_PIXOFFICE_CHAT_URL` or the `chatSource` prop of `OfficeApp`. See the [Chat Integration Protocol](./docs/chat-integration.md).

## Map Editing

The grid button in the top-left corner of the office opens the full-screen layout editor. Choose assets from the furniture catalog at the bottom, drag furniture onto the floor grid, and select it to duplicate, remove, or reassign a workstation. Invalid placements return to their previous positions. Undo and redo are supported; the advanced menu offers JSON import/export and route testing. External AI systems can modify the same shared draft through the `map.edit` protocol without simulating mouse input.

## Character Asset Packs

The six existing characters have independent asset packs under `art/characters/packs/<character-id>/`. Each action is maintained separately. The build generates atlases, frame coordinates, and the character registry. The office and preview share sizing, anchor, and action-sampling contracts.

```bash
npm run characters:build  # Validate admission and build published character packs
npm run characters:check  # Verify source assets match generated resources
```

`npm run dev`, `npm run build`, and `npm test` build these assets automatically. Character atlases and initial office assets use lossless WebP, preserving the original PNG sources, frame coordinates, and action timing. The generated `public/characters/` directory and generated office `.webp` files are not tracked in Git. Legacy atlases remain as source records but are no longer loaded directly for normal frame animation.

On first load, the page draws a white surface and the office background, then loads the initial character packs (seated and working poses) alongside the desks and chairs. Regular textures have a concurrency limit of four; the background loads independently with priority. Progress shows the actual number of completed resources. Sidebar avatars use separate small images instead of full animation atlases. Other poses required by a saved scene are loaded as needed, and legacy ungrouped atlases remain compatible.

Once the office is visible, current work animations continue while the remaining walking, talking, and expression assets load in the background. Interactions, demos, editing controls, and the scene gateway become available when preparation finishes. On failure, the visible scene is preserved and a retry is offered. The browser performance timeline exposes three marks: `pixoffice:background-visible`, `pixoffice:scene-ready` (initial scene visible), and `pixoffice:actions-ready` (full interaction ready). The scene simulation clock does not advance during background loading. Hosts using the headless runtime directly should wait for assets to be ready before advancing the visual simulation.

[Character Configuration and Action Standards](./docs/character-packs.md) · [Character Admission, Visual Review, and Release](./docs/character-admission.md)

New or modified characters must first pass through the staging workflow: `characters:draft → characters:audit → characters:preview → characters:review → characters:publish`. Work frames are checked for body stability, and walking cycles for continuity. Publication requires visual approval tied to that asset version. The six existing characters are preserved for compatibility; this does not mean their historical assets have passed the new standards. The standards migration did not modify their images.

Check the rights and licenses for any assets you use.

## Third-Party Software Licenses

Production builds automatically generate [Third-Party Licenses and Attributions](./public/THIRD_PARTY_NOTICES.txt) and publish them alongside the project license at `/THIRD_PARTY_NOTICES.txt` and `/LICENSE.txt`. Commit updated notices after dependency upgrades. Run `npm run licenses:check` to detect missing, stale, or unreviewed licenses. These notices cover software dependencies only; they do not establish permission to use image assets. See [License Maintenance](./licenses/README.md).

## Running Locally

```bash
npm install
npm run dev
```

The development server serves the project website at `/`. Its top navigation opens the full office at `/office/` or the minimal example at `/minimal/`. `npm run build` generates all three pages in the root `dist/` directory for deployment.

The top metrics, employee sidebar, and task feed are driven by a business data source. To connect the standalone sample business process, run `npm run dashboard-example` in another terminal, then start the frontend with `VITE_OFFICE_DASHBOARD_URL=http://127.0.0.1:18770 npm run dev`. See [Dashboard Data Integration](./docs/dashboard-integration.md) for the interface format and custom adapters.

Employee actions are driven over HTTP by default. `npm run dev` starts both:

- The Vite frontend
- The HTTP Action Gateway

The default action endpoint is:

```text
http://localhost:8765/actions
```

External systems `POST` actions to this endpoint. The frontend retrieves and executes them through HTTP polling.

To set the frontend polling URL:

```bash
VITE_OFFICE_HTTP_ACTIONS_URL=http://localhost:8765/actions npm run dev
```

To start only the action gateway:

```bash
npm run action-gateway
```

To change the gateway port:

```bash
OFFICE_ACTION_GATEWAY_PORT=8766 npm run action-gateway
```

## HTTP Messages

The current protocol uses `POST /scene/commands`. Query a command result with `GET /scene/commands/:commandId`, and read state and capabilities with `GET /scene/state` and `GET /scene/capabilities`. The `/actions` examples below use the legacy compatibility endpoint. The local gateway is for development and integration testing, not a production business service.

A single desk visit:

```bash
curl -X POST http://localhost:8765/actions \
  -H 'Content-Type: application/json' \
  -d '{"type":"desk_visit","visitor":1,"host":5,"message":"Please take over this task."}'
```

Example request body:

```json
{
  "type": "desk_visit",
  "visitor": 1,
  "host": 5,
  "message": "Please take over this task."
}
```

Visit several desks in sequence:

```json
{
  "type": "desk_visit_tour",
  "visitor": 1,
  "hosts": [2, 3, 4],
  "message": "Please take the next step."
}
```

Set an employee's state:

```json
{
  "type": "set_state",
  "rosterNo": 1,
  "state": "working",
  "task": "Organizing market intelligence..."
}
```

## Contact

For discussions or collaboration, scan this WeChat QR code.

<img src="./docs/wechat-qr.png" alt="WeChat QR code" width="220" />
