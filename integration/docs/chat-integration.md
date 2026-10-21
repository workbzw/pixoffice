# PixOffice 聊天流式接口

本文面向为 PixOffice 对话输入框提供回复的聊天服务开发者。外部业务后端在初始化办公室时注册聊天服务地址。浏览器向 PixOffice 服务端发送 HTTP POST，PixOffice 服务端转发请求，聊天服务以 NDJSON 流逐段返回文本。办公室初始化、任务和白板使用[办公室 HTTP 接入协议](./office-integration.md)；聊天服务为可选能力。

| 参与方 | 职责 |
| --- | --- |
| PixOffice 浏览器页面 | 维护办公室会话、发送上下文、显示增量回复、处理用户停止操作 |
| PixOffice 服务端 | 保存初始化时注册的聊天地址，转发聊天请求和流式回复，传递取消信号 |
| 聊天服务 | 接收聊天请求、调用模型或业务逻辑、返回流式事件，并响应请求取消 |

每个办公室拥有独立会话。切换办公室后，生成中的回复和输入草稿继续保留。

## HTTP 接入

外部业务后端通过 `POST /api/pixoffice/messages`，在 `offices.initialize` 请求顶层提供 `chat`：

```json
{
  "type": "offices.initialize",
  "chat": { "url": "https://your-host.example/chat" },
  "offices": [{ "schemaVersion": "1.0", "seq": 1, "workspace": { "id": "office-1", "name": "研发办公室" } }]
}
```

此请求使用办公室 HTTP 协议的 `Authorization: Bearer <PIXOFFICE_API_KEY>`。`chat.url` 是聊天服务提供方实现的完整 HTTP(S) 地址，必须能从 PixOffice 服务端访问；Docker 部署时应使用容器可访问的地址。该地址不能包含用户名、密码或 URL 片段。

一个 PixOffice 服务实例使用一个聊天地址，由请求中的 `teamId` 和 `conversationId` 区分办公室和会话。配置保存在服务端内存中，不发送给浏览器，不写入办公室业务快照。注册不要求浏览器在线，初始化返回 `202` 时有效配置也已保存。

后续初始化省略 `chat` 时保留原配置；提供新的 `chat.url` 时立即供后续聊天请求使用，已经发出的请求继续使用原地址。使用 `chat: { "url": "" }` 停用聊天服务。可以发送 `offices: []` 单独更新聊天配置，无需修改办公室快照的 `seq`。初始化数据校验失败时，聊天配置不会改变。服务端重启后须重新注册地址。

浏览器固定调用同源 `POST /api/pixoffice/chat`，PixOffice 服务端将请求转发至注册的地址，并将 NDJSON 事件持续传回浏览器。外部聊天服务无需为 PixOffice 浏览器配置 CORS。模型 API Key 由外部聊天服务保管，浏览器的 Cookie 和 Authorization 不转发给聊天服务。

PixOffice 服务端以 `Content-Type: application/json` 和 `Accept: application/x-ndjson` 向聊天服务发送以下请求体：

```json
{
  "version": "1.0",
  "teamId": "office-1",
  "conversationId": "uuid",
  "messages": [{ "role": "user", "content": "查看本周的工作情况" }]
}
```

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `version` | 字符串 | 固定为 `"1.0"` |
| `teamId` | 字符串 | 当前办公室的稳定 ID |
| `conversationId` | 字符串 | 浏览器生成的当前会话 ID |
| `messages` | 数组 | 对话上下文；每项含 `role` 和 `content`，角色为 `user` 或 `assistant` |

所有字段都必填。聊天服务成功时返回 HTTP `200`、`Content-Type: application/x-ndjson`。响应由多行 JSON 事件组成，每行以换行符结束，例如：

```jsonl
{"type":"status","phase":"thinking"}
{"type":"delta","text":"本周"}
{"type":"delta","text":"的工作情况如下……"}
{"type":"done"}
```

| `type` | 其他字段 | 含义 |
| --- | --- | --- |
| `status` | `phase: "thinking"` 或 `"streaming"` | 更新处理状态 |
| `delta` | `text`：字符串 | 追加一段回复文本 |
| `done` | 无 | 回复正常结束 |
| `error` | `message`：非空字符串 | 回复生成失败 |

正常回复应输出文本并以 `done` 结束；提前断开或没有回复文本时，页面显示失败。`status` 只描述处理阶段。用户点击停止时浏览器中止请求，PixOffice 服务端随即中止对聊天服务的请求；聊天服务应监听断开并取消上游生成。PixOffice 会校验每条流式事件，非法事件不会转发。

请求字段和每条响应事件中的任何层级都禁止 `null`。字段定义见 [`chatRequestSchema` 和 `chatEventSchema`](../../packages/protocol/src/chat.ts)。

浏览器单次输入最多 4000 字符，一次回复最多 50000 字符，请求最长 180 秒。请求包含当前输入，以及最近最多 10 轮完整历史对话；历史部分总计最多 100000 字符。中断或失败的回复保留在页面中，不作为完整历史发送。HTTP 事件单行最多 32000 字符，其中 `delta.text` 最多 16000 字符。

聊天请求体上限为 512 KiB。办公室未初始化时返回 `404 OFFICE_NOT_INITIALIZED`；未注册或已停用聊天服务时返回 `503 CHAT_NOT_CONFIGURED`；连接失败、重定向、上游非成功响应或错误 Content-Type 返回 `502 CHAT_UPSTREAM_ERROR`；开始流式响应前超时返回 `504 CHAT_TIMEOUT`。这些错误使用统一 `{ "code": 503, "msg": "外部后端尚未配置聊天服务", "data": { "reasonCode": "CHAT_NOT_CONFIGURED", "details": {}, "issues": [] } }` 格式。流式响应开始后发生超时、非法事件或连接中断时，以 `error` 事件结束。

## 历史与页面行为

浏览器按办公室和聊天来源，在当前站点的 IndexedDB 中保存完整会话、草稿和会话 ID。服务器模式使用 PixOffice 的聊天转发地址区分来源，更换外部聊天地址不会自动清空会话。生成中的内容持续更新同一条消息，短周期合并保存，生成结束时立即保存。刷新页面后保留已生成部分并标记为停止；点击“新对话”清空该办公室的当前会话。记录仅存在于当前浏览器，清除站点数据会删除记录。

多个页面同时编辑同一会话时，通过浏览器事务校验存档版本。发生写入冲突，页面保留可见内容并提示临时保存；刷新后读取最新存档。读取失败时保留原记录，保存失败时显示提示并在后续保存时重试。

纯前端演示提供明确标注的交互预览。服务器模式始终调用 PixOffice 的聊天转发接口，未配置服务时显示配置缺失错误。输入框彩色边框跟随请求状态变化，在完成、取消、失败或超时后停止。

## 自定义前端源码适配器

直接集成 React 应用源码的开发者，可通过 `OfficeChatSource` 对接宿主已有的聊天客户端。示例中的 `myAgent` 和 `dataSource` 由宿主提供：

```tsx
import { OfficeApp, type OfficeChatSource } from './example/office-web/src/office'

const chatSource: OfficeChatSource = {
  kind: 'my-agent',
  async *stream(request, signal) {
    // Bridge your trusted host's events here; honor signal cancellation.
    yield* myAgent.stream(request, signal)
  },
}

<OfficeApp dataSource={dataSource} chatSource={chatSource} />
```

`OfficeApp` 的源码入口为 [`example/office-web/src/office.ts`](../../example/office-web/src/office.ts)。自定义聊天源可用稳定的 `historyKey` 隔离历史记录，默认使用 `kind`。自定义持久化实现 `ChatPersistence.write(archive, expected)` 时，应原子校验 `expected`，冲突时抛出 `ChatStorageConflict`。

回复按 Markdown 展示，支持标题、列表、代码块、表格等，禁用原始 HTML 执行。复制和历史记录保留原始文本。聊天服务产生的业务变化由外部业务后端执行，再通过办公室 HTTP 接口更新任务或发送场景指令。
