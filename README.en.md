# PixOffice

[简体中文](./README.md) · **English**

[Live Demo](#demo) · [Quick Start](#quick-start) · [Documentation](#docs) · [Contact & Support](#support)

PixOffice is a 2D interactive scene project built with Vite, React, and PixiJS. It includes six frame-animated characters, multiple offices, task whiteboards, chat, timed decision menus, and grid-based layout editing. Office, classroom, and farm scenes can be assembled independently.

<a id="demo"></a>

## Live Demo

[Website](https://pixoffice.online/?lang=en) · [Full Office](https://pixoffice.online/office/) · [Minimal Example](https://pixoffice.online/minimal/) · [Classroom](https://pixoffice.online/classroom/) · [Farm](https://pixoffice.online/farm/)

![PixOffice office: task whiteboard, walking characters and desk conversations](./docs/office-demo.gif)

The office recording uses local sample data. [View the full-page high-resolution screenshot](./docs/page-preview.jpeg).

<a id="quick-start"></a>

## Quick Start

Use Node.js 24; the minimum supported version is Node.js 22.13.

```bash
npm ci
npm run dev:vite
```

Open the address printed in your terminal and visit `/office/` for a local demo without a business backend. Chat is an interaction preview by default and does not call a model.

For external integration, run `npm run dev` to start the frontend and Fastify, then initialize the offices using the [integration guide](./integration/README.md).

`npm run build` generates `dist/` for a static Vercel demo. See [deployment](./integration/docs/message-relay.md) for server and Docker integration.

<a id="docs"></a>

## Documentation

| Goal | Start Here |
| --- | --- |
| Connect a business backend or agent service | [Integration Guide](./integration/README.md) · [HTTP Contract and Flows](./integration/docs/office-integration.md) |
| Update tasks, employees, and whiteboards | [Business Snapshots and Whiteboard Fields](./integration/docs/dashboard-integration.md) |
| Connect streaming chat | [Chat API](./integration/docs/chat-integration.md) |
| Deploy servers and configure connections or authentication | [Deployment and Messaging](./integration/docs/message-relay.md) |
| Understand packages, independent scenes, and on-demand loading | [Architecture](./docs/architecture/README.md) · [Examples](./example/) |
| Control characters or edit maps | [Runtime SDK](./docs/plugin-runtime.md) · [Map Editor](./docs/map-editor.md) |
| Create, review, or publish character assets | [Character Packs](./docs/character-packs.md) · [Asset Admission](./docs/character-admission.md) |
| Develop scenes and update screenshots or GIFs | [Development and Asset Maintenance](./docs/development.md) |
| Run tests and inspect acceptance reports | [Testing](./tests/README.md) |

Scene and asset packages are developed in this repository and are not published to npm. The 2:1 dimetric entry remains an [architecture prototype](./docs/architecture/dual-products.md); a skeletal animation engine is not implemented. The website is bilingual; example interfaces and most technical documentation are currently in Chinese.

See [LICENSE](./LICENSE) and [Third-Party Notices](./public/THIRD_PARTY_NOTICES.txt) for software licensing. Image asset permissions must be checked separately; see [License Notes](./licenses/README.md).

<a id="support"></a>

## Contact & Support

Follow the project, get in touch, or make a voluntary donation to support continued development.

<table>
  <tr><th align="center" width="50%">Follow & Connect</th><th align="center" width="50%">Support the Project</th></tr>
  <tr><td align="center"><img src="./docs/wechat-qr.png" alt="WeChat contact QR code" width="200" /></td><td align="center"><img src="./docs/donate-qr.jpg" alt="Project donation QR code" width="200" /></td></tr>
  <tr><td align="center">Updates, discussions, and collaboration</td><td align="center">Voluntary donations for development</td></tr>
</table>
