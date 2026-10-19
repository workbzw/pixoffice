# 开发与素材维护

本页集中说明本地开发、独立场景、资源加载和预览录制。首次体验见[项目首页](../README.md#quick-start)，外部业务接入见[对接指南](../integration/README.md)。

## 本地运行

在项目根目录使用 Node.js 24（最低支持 22.13），按锁文件安装：

```sh
npm ci
npm run dev:vite
```

`dev:vite` 启动纯前端演示，使用本地示例数据。首页 `/` 展示项目介绍，其他入口为 `/office/`、`/minimal/`、`/classroom/` 和 `/farm/`。

`npm run dev` 同时启动 Vite 与 Fastify，办公室等待外部业务后端初始化。该模式的运行示例、连接配置和部署要求见[对接指南](../integration/README.md)与[部署文档](../integration/docs/message-relay.md)。

开发前会自动构建公共包与素材。修改 `packages/` 下的代码时，可在另一个终端运行 `npm run packages:watch` 持续重建；素材修改仍需重新运行素材构建，不会自动发布人物包。

## 场景与构建

| 示例 | 开发方式 | 构建方式与范围 |
| --- | --- | --- |
| [完整办公室](../example/office-web/) | `npm run dev:vite`，打开 `/office/` | `npm run build`，在根目录 `dist/` 中生成官网和四个场景入口 |
| [最小办公室](../example/minimal-vanilla/) | 官网的 `/minimal/`，或 `npm run dev -w @pixoffice/example-minimal-vanilla` | 只通过公共包入口装配，不依赖 React |
| [独立人物场景](../example/isolated-scene/) | `npm run dev:isolated` | `npm run build:isolated`，不依赖办公室包 |
| [教室](../example/classroom/) | `npm run dev:classroom` | `npm run build:classroom`，不携带办公室资源 |
| [农场](../example/farm/) | `npm run dev:farm` | `npm run build:farm`，不携带办公室或教室资源 |
| [2:1 轴测验证](../example/dimetric/) | `npm run dev:dimetric` | `npm run build:dimetric`，独立投影、存档与诊断标记，尚非最终美术 |

场景与素材包的依赖关系、导出方式和当前限制见[包架构](./architecture/README.md)与[场景隔离](./architecture/scene-isolation.md)。骨骼动画引擎尚未实现。

## 办公室交互预览

纯前端本地演示点击“开始演示”后，约 15 秒显示当前办公室的一条确认，约 30 秒显示另一个办公室的一条侧边选择卡。每轮仅这两条问题，回答后不追加；有效期从问题出现时计算，停止演示取消尚未出现的问题。真实连接模式的菜单由后端请求触发。

动画区域底部提供聊天输入框，支持展开、停止、收起和新建对话。默认不调用模型或执行业务；真实服务通过 `VITE_PIXOFFICE_CHAT_URL` 或 `OfficeApp.chatSource` 接入，格式见[聊天接口](../integration/docs/chat-integration.md)。

办公室右上角网格按钮进入布局编辑，左上角按钮打开团队空间总览。布局编辑支持家具拖放、工位归属、撤销与重做、JSON 导入导出和路线预检；完整边界见[地图编辑](./map-editor.md)。

## 人物素材与首屏加载

六个人物分别维护在 `art/characters/packs/<人物ID>/`，每个动作独立维护。构建生成图集、帧坐标、注册表和独立头像；源素材是维护入口，不直接编辑生成文件。

```sh
npm run characters:build
npm run characters:check
```

开发、正式构建和测试会自动运行所需的素材构建。人物图集与首屏办公室资源使用无损 WebP，保留源 PNG、帧坐标和动作时序；生成目录不提交 Git。

首屏先绘制背景，再并行加载坐姿、工作帧与家具。普通纹理最多 4 个并发，背景独立优先加载；头像使用独立小图。人物清单必须声明 `startup` / `deferred` 分组和独立 `portrait`，不为缺失动作或旧格式提供隐式回退。

首屏可见后继续播放当前工作动作，后台准备完整的走路、对话与表情资源，就绪后开放场景交互、演示和编辑。失败时保留已显示画面并提供重试；资源准备期间不推进场景模拟。浏览器性能时间线提供：

- `pixoffice:background-visible`：背景已显示。
- `pixoffice:scene-ready`：首屏场景可见。
- `pixoffice:actions-ready`：完整互动可用。

新增或修改人物需要经过暂存、自动检查、视觉验收和发布，具体命令及标准见[人物资源包](./character-packs.md)与[素材准入](./character-admission.md)。当前工作烟雾的源图、参数和生成记录见[工作特效素材说明](../art/office/work-crafting-v1/README.md)。

## 更新截图与动图

安装 Chrome 与 FFmpeg 后，在项目根目录运行：

```sh
npm run docs:capture
```

该命令构建当前版本，并录制办公室，更新 `docs/office-demo.gif` 和 `docs/page-preview.jpeg`。

仅更新动图并保留现有高清截图：

```sh
npm run build
node scripts/capture-readme.mjs --gif-only
```

录制在隔离浏览器中使用本地示例数据，不连接业务后端，也不修改日常使用的存档。

## 检查与许可

包边界、安装验证、回归及浏览器验收命令见[测试与验收](../tests/README.md)。依赖许可声明随正式构建生成，维护方式见[许可说明](../licenses/README.md)；软件许可声明不代表图片素材已获得使用授权。
