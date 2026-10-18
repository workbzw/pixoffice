# PixOffice 部署与浏览器消息通道

本文面向 PixOffice 部署维护者和前端集成开发者，说明服务启动、连接配置、消息转发及容量限制。外部业务后端的接口格式见[办公室 HTTP 接入协议](./office-integration.md)。

PixOffice 包含 React 浏览器页面和 Fastify 服务端。纯静态部署展示本地演示；服务器部署由 Fastify 同源提供页面、业务 HTTP 接口和浏览器 SSE 连接。外部业务后端负责业务数据与处理逻辑，通过 `POST /api/pixoffice/messages` 接入。

```text
外部后端 POST -> Fastify 校验、鉴权、转发 -> SSE -> 浏览器路由 -> 团队运行时队列
本地演示 -----------------------------------------------------> 同一运行时队列
```

## 职责边界

| 内容 | 归属 |
| --- | --- |
| 待执行动画、去重、过期、取消、寻路、占用 | 浏览器的 `SceneRuntime`，每团队独立 |
| 展示连接状态、队列概况 | React 页面订阅场景运行时 |
| 在线浏览器连接及团队订阅 | Fastify 连接表 |
| 离线消息积压、动画执行结果查询、回执 | 本版不提供 |
| 办公室目录、业务快照、白板 | 后端推送，Fastify 缓存最新完整状态，浏览器按 seq 应用并缓存 |
| 前端人物点击、任务操作、详情选项 | Fastify 暂存用户操作；外部业务后端通过 `ui.next` 领取、通过 `ui.respond` 返回展示内容 |
| 用户确认/选项结果 | 回到发起菜单的同一个 POST；超时不默认选择 |
| 聊天历史与流式聊天 | 浏览器保存历史，聊天服务通过独立流式接口返回回复 |

Fastify 保存最多 100 个办公室、总量最多 8 MiB 的最新快照，以及等待中的业务请求和用户操作。用户操作最多 128 项、每项最多等待 60 秒；同时最多允许 16 个 `ui.next` 请求等待操作。容量达到上限时返回 `503`。慢连接关闭后，浏览器重连并获取最新业务快照。

每个办公室拥有独立的场景运行时和动画队列。切换可见办公室时，其他办公室继续运行。办公室主入口订阅整个工作区，新增办公室使用已有连接接收消息。临时动画只向在线页面发送，刷新或关闭页面后不自动重放。

## 启动

```sh
npm install
npm run dev                # Vite + Fastify，页面使用同源代理
npm run dev:vite           # 纯前端演示，不启动连接
```

开发 POST 地址默认为 `http://127.0.0.1:8765/api/pixoffice/messages`。设置 `PORT=其他端口 npm run dev` 时，Fastify 监听和 Vite 代理使用该端口。打开 `/office/` 后，页面等待外部业务后端初始化，可运行 `npm run integration-example` 联调。教室与农场通过各自场景入口加载；首页和最小装配页面不建立业务消息订阅。

Docker：

```sh
docker build -t pixoffice .
docker run --rm -p 3000:3000 -e PIXOFFICE_API_KEY=replace-with-private-key pixoffice
```

打开 `http://localhost:3000/office/`。Docker 默认一个容器、一个 Node 进程，同源提供页面、POST 和 SSE。状态与连接保存于该进程内存，多实例部署需要额外的状态共享和消息广播服务。

镜像包含服务端运行所需的协议、运行时和办公室场景包。构建时会在最终运行层以 `node` 用户初始化服务并检查静态页面目录；依赖缺失或初始化失败会直接终止构建。

默认基础镜像为 Node 24。受限网络可用 `--build-arg NODE_IMAGE=你的镜像地址` 指定可信镜像；项目也支持 Node 22.13+。覆盖容器 `PORT` 时需同步调整端口映射，健康检查会使用该端口。

直接运行 Node.js 生产服务：

```sh
npm run build:full
npm start
```

服务默认监听 `127.0.0.1:8765`。可通过进程环境变量设置 `HOST`、`PORT`、`PIXOFFICE_API_KEY`、`PIXOFFICE_STATIC_ROOT`。`.env.example` 只是配置模板，启动器不自动加载 `.env`；请由 shell、Docker 或部署工具注入。

如果 HTTPS 在反向代理处终止、容器内部使用 HTTP，请为 PixOffice 服务进程设置 `PIXOFFICE_PUBLIC_ORIGIN=https://你的域名`（不带路径或末尾斜杠），用于校验浏览器请求来源。

可运行 `node scripts/check-relay-service.mjs` 检查页面、写入鉴权及 SSE 转发。目标地址和密钥分别由 `PIXOFFICE_URL`、`PIXOFFICE_API_KEY` 环境变量提供；脚本使用独立的测试团队，不会给现有办公室下达动作。

Vercel 静态演示使用构建命令 `npm run build`、输出目录 `dist/`。浏览器通过 `/pixoffice-config.js` 读取连接配置：静态部署默认关闭业务连接，Fastify 在该路径提供启用同源连接的配置，联合开发模式由 Vite 代理该文件。自定义 API Key 仅保存在 PixOffice 服务端和外部业务后端。

生产构建按资源清单发布运行所需素材、品牌图片与许可证。制作原图和生成提示词保存在源码中。清单哈希不匹配或缺少文件时构建失败；教室和农场独立构建使用相同规则。

## 场景指令示例

以下示例需要 `office-1` 已初始化，且服务器模式的办公室页面在线。外部业务后端发送请求：

```sh
curl -X POST http://localhost:8765/api/pixoffice/messages \
  -H 'Authorization: Bearer pixoffice-demo-key' \
  -H 'Content-Type: application/json' \
  -d '{"teamId":"office-1","command":{"protocolVersion":"2.0","sceneId":"office-1","commandId":"hello-1","type":"activity.start","capability":"scene.say","participants":[{"entityId":"office-lead","role":"actor"}],"params":{"text":"开始处理任务。","durationMs":2000}}}'
```

```json
{
    "teamId": "office-1",
    "command": {
      "protocolVersion": "2.0",
      "sceneId": "office-1",
      "commandId": "hello-1",
      "type": "activity.start",
      "capability": "scene.say",
      "participants": [{ "entityId": "office-lead", "role": "actor" }],
      "params": { "text": "开始处理任务。", "durationMs": 2000 }
    }
}
```

`command` 可以是单条场景命令，也可以是含 `mode` 和 `commands` 的批次对象。`mode` 为 `sequence` 或 `parallel`，分别表示顺序或并行执行；批次最多 32 条。每条命令的 `sceneId` 必须等于顶层 `teamId`，每条新指令使用唯一 `commandId`。请求最大 64 KiB。字段定义见[场景协议](./plugin-runtime.md)。

场景请求字段为 `teamId` 和 `command`。业务请求通过 `type` 区分操作。所有 HTTP 响应含 `code`、`msg`、`data`，其中 `data` 为对象，`code` 与 HTTP 状态码一致。数据字段和默认值见[办公室 HTTP 接入协议](./office-integration.md)。

动画请求成功时返回 `data.forwarded`，表示接收指令的在线页面连接数量。动画的排队和播放发生在浏览器内，HTTP 响应不包含播放结果。业务处理应以外部业务后端的状态为依据。

| HTTP/code | 含义 |
| --- | --- |
| 200 | 动画：指令已写入至少一个在线页面连接；业务：取得该操作的结果，详见接入协议 |
| 202 | 最新状态已缓存，但本次请求未取得浏览器应用确认；页面可能离线，也可能因等待请求容量已满而未等待确认 |
| 400 | 消息不符合 schema，或 teamId 与 sceneId 不匹配 |
| 401 | API Key 不正确 |
| 409 | 临时动画/菜单没有在线接收者，或相同 seq 对应不同快照；具体原因见 reasonCode |
| 413 | 超出消息大小限制 |
| 408 | 等待浏览器业务结果或用户选择超时，不默认同意 |
| 503 | 接收方不可用、发送缓冲过满或连接上限 |

初始化或快照更新超时、断线、页面应用失败后，可用相同 `seq` 和相同内容重试；服务端会重新同步，而不是仅因缓存已有该版本就跳过。`200 applied` 表示取得页面应用确认，`202 cached` 仅表示已缓存。较旧的 `seq` 仍被忽略，相同 `seq` 的不同内容返回 `409 SEQ_CONFLICT`。

临时动画采用在线转发方式，转发失败或页面中断时不自动补发。工作中、空闲、任务完成等持续业务状态通过完整快照同步。

## 浏览器内部接口

以下接口由 PixOffice 浏览器代码调用。外部业务后端使用 `/api/pixoffice/messages` 即可完成业务接入。

| 接口 | 浏览器用途 |
| --- | --- |
| `GET /api/pixoffice/events` | 建立 SSE 连接，接收状态快照、场景指令和待处理业务请求 |
| `POST /api/pixoffice/reply` | 将浏览器业务处理结果返回 PixOffice 服务端 |
| `POST /api/pixoffice/ui` | 提交人物点击、任务按钮和详情按钮等用户操作 |

独立场景通过 `GET /api/pixoffice/events?teams=office-1,office-2` 订阅指定团队。办公室主入口使用 `GET /api/pixoffice/events?workspace=1` 订阅工作区；首次连接或重连接收 `office.sync.start`、`office.sync` 最新快照及 `office.sync.complete` 同步结束事件。`office.sync.start.stateId` 标识当前服务端内存状态，服务重启后会变化；浏览器据此移除上一次服务状态的缓存目录。同一状态内较小 `seq` 的快照被忽略，正常重连保留已有场景运行时。同步结束事件携带服务端当前完整目录。办公室应用共用一条 SSE，新增办公室继续使用该连接。

仅含 `teams` 的订阅用于场景动画，不接收办公室业务请求、快照恢复或菜单关闭通知，也不计为在线办公室业务页面。业务消息仅发送到 `workspace=1` 的订阅；动画仍发送到匹配团队及办公室工作区的订阅。仅动画页面在线时，快照返回 `202 cached`，指定办公室查询和菜单请求返回 `409 NO_RECEIVER`。

每个应用最多管理 100 个办公室或团队，目录创建、场景运行时和服务端使用同一数量上限。

多个页面订阅同一团队时，每页收到一份消息并独立播放。各页面不保证逐帧同步。SSE 按连接发送当前事件，重连通过最新业务快照恢复状态。

内部 SSE 的业务事件用 `type` 指定事件类别，状态同步事件为 `{type: "office.sync", snapshot: ...}`，场景指令为 `{teamId, command}`。需浏览器处理的业务请求包含服务端生成的 `responseToken` 和剩余有效期 `remainingMs`；浏览器采用本地单调时钟计时，服务端负责最终超时判定，不要求两端系统时钟一致。浏览器向 `/api/pixoffice/reply` 提交 `{responseToken, result: {code, msg, data}}`，服务端据此完成对应 HTTP 响应。多个页面回报同一请求时，最先收到的有效成功结果完成请求；后续回报返回 `410`，页面按请求已结束处理。内部事件结构定义于 [`office-integration.ts`](../packages/protocol/src/office-integration.ts) 和 [`relay.ts`](../packages/protocol/src/relay.ts)。

## 安全与范围

默认 `pixoffice-demo-key` 是公开演示值，不是有效的保密凭证。服务端启动时警告；公网正式使用应通过环境变量替换，并使用 HTTPS。自定义密钥仅由 Fastify 和调用方后端持有，不注入 React 或运行时配置。

API Key 校验保护 POST 写入。浏览器 SSE 是同源的演示订阅，不内置用户登录，也不构成租户权限隔离；teamId 只是路由标识。跨站浏览器订阅会被拒绝，但这不能阻止独立 HTTP 客户端读取公开 SSE。需要展示私密业务数据时，应先由反向代理/宿主添加页面及 SSE 的访问控制，或限制到可信内网。Vercel 纯演示不接收真实业务消息。

用户操作领取与结果提交使用 `/api/pixoffice/messages` 的 `ui.next` 和 `ui.respond` 操作，完整格式见[办公室 HTTP 接入协议](./office-integration.md)。聊天服务的配置与流式消息格式见[聊天接入协议](./chat-integration.md)。
