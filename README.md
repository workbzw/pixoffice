# PixOffice

**简体中文** · [English](./README.en.md)

[官网：pixoffice.online](https://pixoffice.online/?lang=zh)

[完整办公室](https://pixoffice.online/office/) · [最小装配](https://pixoffice.online/minimal/) · [教室](./example/classroom/README.md) · [农场](./example/farm/README.md)

![PixOffice 当前办公室：任务白板、人物走动与工位交流](./docs/office-demo.gif)

当前办公室动画区域实录（2026-10-19，6秒循环、25帧/秒）：墙面任务白板、电脑旁任务气泡、人物走动与工位交流。画面使用本地示例数据。[查看完整页面的 3200×2000 高清截图](./docs/page-preview.jpeg)。

PixOffice 是独立的二维办公室前端项目，采用 Vite + React + Pixi。页面采用可替换的业务数据源展示指标、任务与员工；场景内核通过版本化协议和可信内置插件驱动人物、物品与活动。未接入业务服务时使用明确标识的示例数据。

内置六个人物的帧动画、坐姿和办公室素材，支持多办公室切换、工位拜访、多人会议、持续专注、固定格式任务白板、限时确认与选项菜单、插件启停和网格拖放布局。

地图与人物行走统一使用整数格。家具占地、入口格、使用格和资源预约由各场景包定义；平滑动画只在渲染层插值。当前命令协议为 `2.0`，详见[整数格与家具互动](./docs/integer-grid-and-interactions.md)。

[办公室 HTTP 接入协议](./docs/office-integration.md) · [业务快照字段说明](./docs/dashboard-integration.md) · [场景运行时 SDK 与命令协议](./docs/plugin-runtime.md) · [地图编辑器与 AI 编辑协议](./docs/map-editor.md) · [消息转发与部署](./docs/message-relay.md)

[场景扩展与动画架构](./docs/architecture/README.md)：办公室、教室与农场平级独立，复用公共运行时和帧动画适配器。农场支持播种、浇水、生长、采收和双农夫自动照料。骨骼引擎尚未实现。

## 包与示例

项目使用 npm workspaces，共十一个包。五个通用包：`protocol` 对接协议、`contracts` 表现与动画契约、`runtime` 核心运行时、`renderer-pixi` 渲染宿主、`animation-frame` 帧播放器。三个现有场景分别由 `scene-office` / `assets-office`、`scene-classroom` / `assets-classroom`、`scene-farm` / `assets-farm` 组成，场景之间不互相依赖。

- [完整办公室](./example/office-web)：保留当前 React 界面、聊天、编辑器与 HTTP 接入。
- [最小装配](./example/minimal-vanilla)：只通过公开包入口拼装办公室，不依赖 React。
- [独立场景](./example/isolated-scene)：不安装办公室包，只装配一个可行走人物；`npm run dev:isolated`。
- [独立教室](./example/classroom)：教师讲课、学生回答、黑板更新；`npm run dev:classroom`。独立部署用 `npm run build:classroom`，产物不含办公室资源。
- [独立农场](./example/farm)：2 位农夫、6 块菜地、3 种蔬菜和种植闭环；`npm run dev:farm`。独立部署用 `npm run build:farm`，不携带办公室或教室资源。本地存档，离线暂停生长。
- [轴测装配](./example/dimetric)：新 2:1 风格产品的独立架构验证；`npm run dev:dimetric`、`npm run build:dimetric`。复用协议与运行时，独立投影和存档，不携带现有场景素材；目前为诊断标记，尚非最终像素美术。详见[双产品架构](./docs/architecture/dual-products.md)。
- [架构与分工](./docs/architecture/README.md)：依赖方向、资源交付、骨骼/场景开发入口。

`npm run packages:build` 构建包；`npm run packages:check` 检查边界；`npm run packages:smoke` 将 tgz 安装到仓库之外验证。代码包目前只在仓库内开发，未发布 npm。素材独立部署，可用 `npm run assets:export -- /absolute/path/to/new-public-directory` 导出。

场景通过 `SceneAssembly` 按需装配；家具和各人物可按版本清单单独导出，详见[场景隔离与按需交付](./docs/architecture/scene-isolation.md)。独立示例使用自己的 public 目录，完整官网仍包含办公室资源。

## 办公室对话

动画区域底部提供悬浮输入框。发送消息后，对话面板向上展开；生成时输入框显示流动彩色边框，支持停止、收起和新建对话。默认是明确标注的交互预览，不调用模型或执行任务。通过 `VITE_PIXOFFICE_CHAT_URL` 或 `OfficeApp` 的 `chatSource` 接入真实流式服务，详见[聊天接入协议](./docs/chat-integration.md)。

本地预览点击“开始演示”后，约 15 秒弹出当前办公室的一条确认问题，约 30 秒在另一个办公室显示一条侧边选择卡。每轮仅这两条，回答后不追加问题；有效期从出现时计算，停止演示会取消尚未出现的问题。真实后端菜单仍由后端请求触发。

## 地图编辑

办公室右上角网格按钮进入全屏「布置办公室」；左上角按钮打开团队空间总览。从底部家具目录选取素材，拖动家具并吸附地面网格，选中后可复制、收起或调整工位所属人物。非法摆放自动回原位；支持撤销 / 重做，高级菜单提供 JSON 导入导出与路线测试。外部 AI 可通过同一套 `map.edit` 协议修改共享草稿，不需要模拟鼠标。

## 更新预览素材

安装 Chrome 和 FFmpeg 后运行 `npm run docs:capture`，构建当前版本并自动实录办公室，更新上述动图和高清截图。只更新动图并保留现有高清截图，可在构建后运行 `node scripts/capture-readme.mjs --gif-only`。录制使用独立浏览器中的本地演示，不连接业务后端、不修改日常使用的存档。

## 人物资源包

现有六个人已迁移为独立资源包：`art/characters/packs/<人物ID>/`。每个动作独立维护，构建时自动生成图集、帧坐标和人物注册表，办公室与预览共用尺寸、锚点和动作采样协议。

```bash
npm run characters:build  # 检查准入并打包正式人物
npm run characters:check  # 校验源素材与生成资源是否一致
```

`npm run dev`、`npm run build`、`npm test` 会先自动打包。人物图集和首屏办公室素材采用无损 WebP，保留当前源 PNG、帧坐标和动作时序。生成目录 `public/characters/` 与办公室生成的 `.webp` 不纳入 Git；早期人物整图、废弃设计稿和旧打包残留已清理，当前人物包及在用素材的制作来源保留。

首次打开先绘制白底与办公室背景，人物首屏包（坐姿、工作帧）、桌椅并行加载（普通纹理最多 4 个并发，背景独立优先加载），显示实际资源完成数量。侧栏头像使用独立小图，不拉取完整动作图集。保存场景中的其他当前姿态按需补齐。人物清单必须声明 `startup` / `deferred` 图集分组，人物注册表必须包含独立 `portrait`；旧格式明确拒绝，缺少动作不会替换成其他动作。

办公室可见后继续播放当前工作动作，后台准备走路、对话和表情等完整动作；准备完成后开放场景互动、演示和编辑入口。失败时保留已显示画面，并提供重试。浏览器性能时间线提供 `pixoffice:background-visible`、`pixoffice:scene-ready`（首屏可见）与 `pixoffice:actions-ready`（完整互动可用）三个标记。后台加载期间场景不推进模拟时钟；直接使用 headless runtime 的宿主应等待资源就绪后再推进视觉模拟。

[人物配置与动作规范](./docs/character-packs.md) · [新增人物、素材验收与发布流程](./docs/character-admission.md)

新增或修改人物必须先在暂存目录完成 `characters:draft → characters:audit → characters:preview → characters:review → characters:publish`。工作帧检查身体静止、步态检查循环连续性，发布需要绑定该素材版本的视觉验收。存量素材的冻结标记见各人物配置。

注意素材版权问题！

## 第三方软件许可

正式构建自动生成[第三方许可证与署名](./public/THIRD_PARTY_NOTICES.txt)，并与项目许可证一起发布到网站的 `/THIRD_PARTY_NOTICES.txt` 和 `/LICENSE.txt`。依赖升级后应提交更新的声明文件；`npm run licenses:check` 可检查缺失、过期或未经审核的许可。此声明仅涵盖软件依赖，不代表图片素材已获得授权，详见[许可维护说明](./licenses/README.md)。

## 运行

使用 Node.js 24 LTS（最低支持 Node.js 22.13）。建议使用 `npm ci` 按锁文件安装。

```bash
npm install
npm run dev:vite
```

开发服务首页 `/` 为项目介绍，顶部菜单可进入完整办公室 `/office/`、最小装配 `/minimal/`、教室 `/classroom/` 和农场 `/farm/`。`npm run build` 同时生成五个页面，部署时仍使用根目录 `dist/`。

页面顶部指标、左侧员工、右侧任务流由业务数据源驱动。纯前端演示使用本地数据；服务器模式由外部业务后端向 PixOffice 服务端提交办公室和任务。运行 `npm run dev`，打开 `/office/`，再在另一个终端运行 `npm run integration-example`，可以查看初始化、任务展示、用户确认和任务完成流程。接口字段与调用示例见[办公室 HTTP 接入协议](./docs/office-integration.md)。

## 消息对接与部署

同一个仓库、同一份 React：Vercel 只发布 `dist/`，使用本地演示数据，不连接后台、不使用 Functions。Docker 则同时提供相同页面和 Fastify 接口，运行时开启真实对接，不需要另建前端。

`npm run dev` 同时启动 Vite 和 Fastify，办公室页面等待外部业务后端提交初始化数据。`npm run dev:vite` 启动纯前端本地演示。外部业务后端使用 HTTP POST 调用 PixOffice 服务端；浏览器与 PixOffice 服务端之间通过 SSE 接收状态和场景指令。

- POST 地址：`http://localhost:8765/api/pixoffice/messages`
- 请求头：`Authorization: Bearer pixoffice-demo-key`
- 浏览器队列负责动画排队、去重、过期及取消；Fastify 缓存每个办公室最新完整快照，不保存动画历史。SSE 首次连接或重连自动同步最新状态，已有运行时不重建。
- 快照包含递增的 `seq` 和固定格式 `whiteboard`，旧版本不会覆盖新版本。离线快照返回 HTTP 202（仅已缓存）；在线应用后返回 200。动画和菜单离线返回 409，菜单超时 408，不默认同意。
- 默认密钥是公开演示值；公网部署通过 `PIXOFFICE_API_KEY` 覆盖。真正的自定义密钥不会进入前端产物。
- 支持 `offices.initialize`、`office.snapshot`、`office.read`、`office.capabilities`、`decision.request`、`ui.next` 和 `ui.respond`。运行 `npm run integration-ui-example`，可接收人物点击、任务按钮操作，并返回详情或白板内容。对话输入框使用[聊天流式接口](./docs/chat-integration.md)。

完整边界、批量指令、安全说明和 Docker 命令见[消息转发与部署](./docs/message-relay.md)。

```bash
docker build -t pixoffice .
docker run --rm -p 3000:3000 -e PIXOFFICE_API_KEY=your-private-key pixoffice
```

打开 `http://localhost:3000/office/` 后，外部后端向同一个网址的 `/api/pixoffice/messages` 发送消息即可。

## HTTP 消息

业务请求为含 `type` 及对应参数的 JSON 对象，例如 `{"type":"office.read","teamId":"office-1"}`。场景指令请求含 `teamId` 和 `command`，其中命令的 `sceneId` 与 `teamId` 一致。响应包含 `code`、`msg`、对象类型的 `data`，所有协议数据禁止 `null`。完整字段见[办公室 HTTP 接入协议](./docs/office-integration.md)。

以下工位拜访示例使用 `integration-example` 创建的 `office-1`，调用时保持办公室页面在线：

```bash
curl -X POST http://localhost:8765/api/pixoffice/messages \
  -H 'Authorization: Bearer pixoffice-demo-key' \
  -H 'Content-Type: application/json' \
  -d '{"teamId":"office-1","command":{"protocolVersion":"2.0","sceneId":"office-1","commandId":"visit-1","type":"activity.start","capability":"office.visit","participants":[{"entityId":"office-lead","role":"visitor"},{"entityId":"code-agent","role":"host"}],"params":{"stops":[{"hostId":"code-agent","message":"这件事交给你了。"}]}}}'
```

以下 JSON 定义场景命令，发送 HTTP 请求时放入顶层 `command` 字段：

```json
{
  "protocolVersion": "2.0",
  "sceneId": "office-1",
  "commandId": "visit-1",
  "type": "activity.start",
  "capability": "office.visit",
  "participants": [
    { "entityId": "office-lead", "role": "visitor" },
    { "entityId": "code-agent", "role": "host" }
  ],
  "params": { "stops": [{ "hostId": "code-agent", "message": "这件事交给你了。" }] }
}
```

连续拜访多个工位：

```json
{
  "protocolVersion": "2.0",
  "sceneId": "office-1",
  "commandId": "tour-1",
  "type": "activity.start",
  "capability": "office.visit",
  "participants": [
    { "entityId": "office-lead", "role": "visitor" },
    { "entityId": "code-agent", "role": "host" },
    { "entityId": "search-agent", "role": "host" }
  ],
  "params": {
    "stops": [
      { "hostId": "code-agent", "message": "请接手开发。" },
      { "hostId": "search-agent", "message": "请补充资料。" }
    ]
  }
}
```

设置员工状态：

```json
{
  "protocolVersion": "2.0",
  "sceneId": "office-1",
  "commandId": "work-1",
  "type": "actor.presentation.set",
  "actorId": "office-lead",
  "status": "working",
  "title": "整理市场情报…",
  "sourceRevision": 1
}
```

每条新命令使用新的 `commandId`；相同 ID 用于重复提交去重。人物通过稳定的实体 ID 指定，不使用显示名称或名册序号。`sourceRevision` 随同一人物的业务展示更新递增。

## 联系我

如需交流或合作，可以扫码

<img src="./docs/wechat-qr.png" alt="微信二维码" width="220" />
