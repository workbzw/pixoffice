# PixOffice

**简体中文** · [English](./README.en.md)

[在线演示](#demo) · [快速开始](#quick-start) · [文档](#docs) · [关注与支持](#support)

PixOffice 是基于 Vite + React + PixiJS 的二维互动场景项目。内置六个人物的帧动画，支持多办公室、任务白板、聊天、限时决策菜单和网格布局编辑；办公室、教室、农场可独立装配。

<a id="demo"></a>

## 在线演示

[官网](https://pixoffice.online/?lang=zh) · [完整办公室](https://pixoffice.online/office/) · [最小装配](https://pixoffice.online/minimal/) · [教室](https://pixoffice.online/classroom/) · [农场](https://pixoffice.online/farm/)

![PixOffice 办公室：任务白板、人物走动与工位交流](./docs/office-demo.gif)

办公室演示使用本地示例数据。[查看完整页面高清截图](./docs/page-preview.jpeg)。

<a id="quick-start"></a>

## 快速开始

使用 Node.js 24，最低支持 Node.js 22.13。

```bash
npm ci
npm run dev:vite
```

打开终端显示的地址，进入 `/office/` 即可体验本地演示，无需业务后端。聊天默认为交互预览，不调用模型。

接入外部系统时使用 `npm run dev` 启动前端与 Fastify，再按[对接指南](./integration/README.md)初始化办公室。

`npm run build` 生成 `dist/`，可用于 Vercel 静态演示；服务器与 Docker 对接部署见[部署文档](./integration/docs/message-relay.md)。

<a id="docs"></a>

## 文档

| 你想做什么 | 阅读入口 |
| --- | --- |
| 接入业务后端或智能体 | [对接指南](./integration/README.md) · [HTTP 协议与流程图](./integration/docs/office-integration.md) |
| 更新任务、员工与白板 | [业务快照与白板字段](./integration/docs/dashboard-integration.md) |
| 接入流式聊天 | [聊天接口](./integration/docs/chat-integration.md) |
| 部署服务器、配置连接与鉴权 | [部署与消息通道](./integration/docs/message-relay.md) |
| 了解包架构、独立场景与按需加载 | [架构文档](./docs/architecture/README.md) · [示例目录](./example/) |
| 控制人物行为或编辑地图 | [运行时 SDK](./docs/plugin-runtime.md) · [地图编辑](./docs/map-editor.md) |
| 制作、验收或发布人物素材 | [人物资源包](./docs/character-packs.md) · [素材准入](./docs/character-admission.md) |
| 开发场景、更新截图和动图 | [开发与素材维护](./docs/development.md) |
| 运行测试、查看验收报告 | [测试与验收](./tests/README.md) |

场景包与素材包在仓库内开发，尚未发布 npm。2:1 轴测入口仍为[架构验证](./docs/architecture/dual-products.md)，骨骼动画引擎尚未实现。

软件许可见 [LICENSE](./LICENSE) 与[第三方声明](./public/THIRD_PARTY_NOTICES.txt)；图片素材的使用授权需另行确认，详见[许可说明](./licenses/README.md)。

<a id="support"></a>

## 关注与支持

欢迎关注交流，也可以自愿赞助，支持项目持续开发。

<table>
  <tr><th align="center" width="50%">关注与交流</th><th align="center" width="50%">支持项目</th></tr>
  <tr><td align="center"><img src="./docs/wechat-qr.png" alt="关注与交流二维码" width="200" /></td><td align="center"><img src="./docs/donate-qr.jpg" alt="项目捐赠二维码" width="200" /></td></tr>
  <tr><td align="center">获取动态、交流合作</td><td align="center">自愿赞助、支持开发</td></tr>
</table>
