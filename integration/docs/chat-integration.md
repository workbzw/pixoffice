# PixOffice 聊天流式接口

本文面向为 PixOffice 对话输入框提供回复的聊天服务开发者。外部业务后端在初始化办公室时注册聊天服务地址。浏览器向 PixOffice 服务端发送 HTTP POST，PixOffice 服务端转发请求，聊天服务以 NDJSON 流逐段返回文本。办公室初始化、任务和白板使用[办公室 HTTP 接入协议](./office-integration.md)；聊天服务为可选能力。

| 参与方 | 职责 |
| --- | --- |
| PixOffice 浏览器页面 | 维护会话选择和草稿、分页读取历史、显示增量回复、恢复接收及提交停止操作 |
| PixOffice 服务端 | 保存初始化时注册的聊天地址，校验并转发请求和结果 |
| 聊天服务 | 持久化历史和生成状态、执行回复生成、提供历史分页和回复恢复、处理显式停止 |

一个办公室对应一个工作区，办公室内可以有多个独立会话。底部输入条向上展开后，通过顶部标签切换会话，也可点击输入条左侧的绿色会话标签打开完整列表。聊天记录、草稿、生成状态、任务和白板分别归属会话；切换会话或办公室不会停止其他会话的回复生成。

机器可读契约由初始化响应 `data.capabilities.chat` 或独立 `office.capabilities` 的 `data.chat` 提供，包含四种操作的请求、成功响应、流事件 JSON Schema 和当前服务端使用的超时及大小限制。初始化与全局查询的 `data.state.chat.configured` 表示是否已注册地址，不返回服务地址或模型密钥。

## HTTP 接入

外部业务后端通过 `POST /api/pixoffice/messages`，在 `offices.initialize` 请求顶层提供 `chat`：

```json
{
  "type": "offices.initialize",
  "chat": {
    "url": "https://your-host.example/chat"
  },
  "offices": [
    {
      "schemaVersion": "1.0",
      "seq": 1,
      "workspace": {
        "id": "office-1",
        "name": "研发办公室"
      },
      "conversations": [
        {
          "id": "main",
          "title": "登录模块开发"
        }
      ]
    }
  ]
}
```

此请求使用办公室 HTTP 协议的 `Authorization: Bearer <PIXOFFICE_API_KEY>`。`chat.url` 是聊天服务提供方实现的完整 HTTP(S) 地址，必须能从 PixOffice 服务端访问；Docker 部署时应使用容器可访问的地址。该地址不能包含用户名、密码或 URL 片段。

一个 PixOffice 服务实例使用一个聊天地址，由请求中的 `teamId` 和 `conversationId` 区分办公室和会话。配置保存在服务端内存中，不发送给浏览器，不写入办公室业务快照。注册不要求浏览器在线，初始化返回 `202` 时有效配置也已保存。

后续初始化省略 `chat` 时保留原配置；提供新的 `chat.url` 时立即供后续聊天请求使用，已经发出的请求继续使用原地址。使用 `chat: { "url": "" }` 停用聊天服务。可以发送 `offices: []` 单独更新聊天配置，无需修改办公室快照的 `seq`。初始化数据校验失败时，聊天配置不会改变。服务端重启后须重新注册地址。

浏览器固定调用同源 `POST /api/pixoffice/chat`，PixOffice 服务端将请求转发至注册的地址。以下四种操作使用同一个 POST 地址，通过 `type` 区分。外部聊天服务无需为 PixOffice 浏览器配置 CORS。模型 API Key 由外部聊天服务保管，浏览器的 Cookie 和 Authorization 不转发给聊天服务。

| `type` | 用途 | 成功响应 |
| --- | --- | --- |
| `send` | 提交一轮消息并接收回复 | NDJSON |
| `history` | 分页读取已有记录及生成状态 | JSON：`{code, msg, data}` |
| `resume` | 继续接收指定轮次的回复 | NDJSON，首条为完整 `snapshot` |
| `cancel` | 明确停止指定轮次的生成 | JSON：`{code, msg, data}` |

所有操作包含 `version: "1.0"`、`teamId`、`conversationId`。空值使用 `""`、`[]`、`false` 等明确值，所有层级禁止 `null`。JSON 响应的 `data` 固定为对象。

## 发送消息

PixOffice 服务端以 `Content-Type: application/json` 和 `Accept: application/x-ndjson` 向聊天服务发送以下请求体：

```json
{
  "version": "1.0",
  "type": "send",
  "turnId": "turn-20261022-001",
  "teamId": "office-1",
  "conversationId": "uuid",
  "messages": [{ "role": "user", "content": "查看本周的工作情况" }]
}
```

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `version` | 字符串 | 固定为 `"1.0"` |
| `type` | 字符串 | 固定为 `"send"` |
| `turnId` | 字符串 | 浏览器生成的一轮对话的稳定 ID，同时标识这次用户输入和助手回复 |
| `teamId` | 字符串 | 当前办公室的稳定 ID |
| `conversationId` | 字符串 | 所选会话的稳定 ID，与办公室快照 `conversations[].id` 一致；新建本地草稿时由浏览器生成 |
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
| `snapshot` | `text`、`state`、`message` | 替换当前助手回复的完整内容；`state` 为 `pending`、`complete`、`stopped` 或 `error` |

正常增量回复输出文本并以 `done` 结束。`snapshot.text` 是完整内容，浏览器用它替换已显示的内容；`snapshot.state` 不是 `pending` 时，该快照同时表示回复结束。`message` 在非错误状态下使用空字符串。PixOffice 会校验每条流式事件，非法事件不会转发。

聊天服务应按 `teamId + conversationId + turnId` 保存轮次。相同 ID、相同输入重复提交时返回已有轮次的当前状态及后续事件，不重复启动生成；同一 ID 对应不同输入时拒绝请求。`messages` 是有界的近期上下文，完整历史和较早上下文由聊天服务维护。

请求字段和每条响应事件中的任何层级都禁止 `null`。字段定义见 [`chatOperationSchema`、`chatHistoryPageSchema` 和 `chatEventSchema`](../../packages/protocol/src/chat.ts)。

浏览器单次输入最多 4000 字符，一次回复最多 50000 字符，一次流连接最长 180 秒。请求包含当前输入，以及最近最多 10 轮完整历史对话；历史部分总计最多 100000 字符。中断或失败的回复保留在页面中，不作为完整历史发送。HTTP 事件单行最多 350000 字符，其中 `delta.text` 最多 16000 字符，`snapshot.text` 最多 50000 字符。

聊天请求体上限为 512 KiB。办公室未初始化时返回 `404 OFFICE_NOT_INITIALIZED`；未注册或已停用聊天服务时返回 `503 CHAT_NOT_CONFIGURED`；连接失败、重定向、上游非成功响应或错误 Content-Type 返回 `502 CHAT_UPSTREAM_ERROR`；开始流式响应前超时返回 `504 CHAT_TIMEOUT`。这些错误使用统一 `{ "code": 503, "msg": "外部后端尚未配置聊天服务", "data": { "reasonCode": "CHAT_NOT_CONFIGURED", "details": {}, "issues": [] } }` 格式。流式响应开始后发生超时、非法事件或连接中断时，以 `error` 事件结束。

## 历史分页

### 后端主动通知更新

外部聊天服务保存新的记录或更新已有轮次后，外部业务后端通过现有鉴权入口发送：

```json
{
  "type": "chat.updated",
  "teamId": "office-1",
  "conversationId": "main"
}
```

此操作使用 `POST /api/pixoffice/messages` 和 `Authorization: Bearer <PIXOFFICE_API_KEY>`。先保存聊天内容，再发送通知。办公室和会话须已通过办公室快照登记，聊天地址须已注册；`chat.updated` 不修改业务快照，也不需要增加快照 `seq`。请求与返回 Schema 同时包含在初始化能力清单中。

PixOffice 将通知投递到现有浏览器 SSE 连接。页面通过既有 `history` 操作读取最新记录，保持草稿和所选会话。当前会话会自动刷新，未打开的会话标记为待同步并在切换时读取。通知到达时若正在接收回复，继续接收该回复，结束后再同步历史；正在读取历史时收到多次通知，会合并为后续读取。

```json
{
  "code": 200,
  "msg": "Chat update notified",
  "data": { "teamId": "office-1", "conversationId": "main", "forwarded": 1 }
}
```

`forwarded` 是通知已投递的浏览器连接数，不是历史读取完成数，不等待浏览器回执。没有可投递页面时返回 `202`、`forwarded: 0`。通知不缓存聊天正文或积攒离线消息；页面上线、切换会话及 SSE 断线恢复后读取聊天服务的最新历史。重复通知可以安全发送，不会创建新的聊天轮次。建议在一轮消息保存或生成结束后通知，无需逐字通知。

未初始化的办公室返回 `404 OFFICE_NOT_INITIALIZED`，未登记的会话返回 `404 CONVERSATION_NOT_FOUND`，未配置聊天地址返回 `503 CHAT_NOT_CONFIGURED`。

### 读取历史

初次进入会话时读取最近记录，向上滚动或点击“加载更早消息”时读取较早的一页：

```json
{
  "version": "1.0", "type": "history", "teamId": "office-1", "conversationId": "main",
  "cursor": "", "limit": 20
}
```

`cursor` 为空表示最近一页；后续使用上一页返回的 `nextCursor`。`limit` 为 1–50，默认 20。每页中的轮次按从旧到新排列，游标必须在新消息追加后保持有效。空会话返回空数组，不创建新的生成任务。

```json
{
  "code": 200,
  "msg": "OK",
  "data": {
    "turns": [
      { "id": "turn-20261022-001", "user": "查看本周的工作情况", "assistant": "本周的工作情况如下", "state": "pending", "error": "" }
    ],
    "nextCursor": "",
    "hasMore": false,
    "activeTurnId": "turn-20261022-001"
  }
}
```

`turns[].id` 对应发送请求中的 `turnId`。每轮包含一条用户输入和同一条持续更新的助手回复，`state` 为 `pending`、`complete`、`stopped` 或 `error`。`error` 无错误时为 `""`。同一会话最多一条未完成回复，必须是最近一轮；最近页须包含它，并通过 `activeTurnId` 指明。没有未完成回复时，`activeTurnId` 为 `""`。

`hasMore` 为 `true` 时 `nextCursor` 必须非空，且继续翻页时游标必须前进；没有更早记录时返回 `hasMore: false`、`nextCursor: ""`。服务端一次历史 JSON 响应最多 8 MiB。

## 刷新恢复与停止

浏览器刷新、重新进入会话或换设备后读取历史。若返回非空 `activeTurnId`，浏览器发起恢复请求：

```json
{
  "version": "1.0", "type": "resume", "teamId": "office-1", "conversationId": "main",
  "turnId": "turn-20261022-001"
}
```

恢复流的第一条事件必须是 `snapshot`，随后才能输出增量；快照与后续订阅须来自同一条生成任务，不能漏掉中间更新。例如：

```jsonl
{"type":"snapshot","text":"本周的工作情况如下","state":"pending","message":""}
{"type":"delta","text":"：已完成登录功能。"}
{"type":"done"}
```

若生成已经结束，直接返回一条 `state: "complete"`、`"stopped"` 或 `"error"` 的完整快照即可。恢复请求只订阅既有任务，不重新发送用户消息。恢复失败时保留已有内容，用户可点击“重新同步”重试。

浏览器连接断开时，聊天服务只移除该连接的订阅，保留生成任务和已生成内容。用户点击停止按钮时，浏览器单独提交：

```json
{
  "version": "1.0", "type": "cancel", "teamId": "office-1", "conversationId": "main",
  "turnId": "turn-20261022-001"
}
```

聊天服务停止对应生成并保存最终状态，然后返回：

```json
{ "code": 200, "msg": "OK", "data": { "stopped": true } }
```

停止请求可重复；已结束的轮次也返回 `stopped: true`。历史和停止请求最长等待 15 秒。OpenPaw 须持久化历史和任务状态；PixOffice 服务端只转发，不代替聊天服务保存生成任务。

## 本地记录与页面行为

浏览器按办公室和聊天来源，在当前站点的 IndexedDB 中保存会话目录、当前选择、已读取记录和草稿。记录每 50 条分块存储，只更新变化的块，草稿单独保存在小型元数据中。生成中的内容持续更新同一条消息，短周期合并保存，生成结束时立即保存。现有整份本地存档首次修改时转换为分块存储，保留原记录。

消息列表只渲染可见区域及少量邻近记录；向上加载旧记录时保留阅读位置。切换不会中断回复；重新打开会话会同步最新历史。本地草稿不会被后端历史覆盖。点击“新会话”新增会话，不清空其他记录。

外部业务后端通过办公室快照 `conversations` 提供会话 ID、标题及该会话的任务和白板。浏览器新建会话时先创建本地草稿 ID，发送第一条消息时将该 ID 交给聊天服务。聊天服务应按 `teamId + conversationId` 建立或查找会话；保存首轮消息后，外部业务后端须在后续完整快照中加入同一 ID 的会话，即使暂时没有任务或白板。其他浏览器依靠该目录找到会话入口，再读取历史；只保存聊天记录而不更新目录，其他浏览器无法发现新会话。前端会合并该会话的业务数据与本地聊天，不创建第二份会话。只点击加号但未发送消息，不会创建后端业务记录。

每个会话标签右侧提供删除图标。删除本地会话会先确认停止生成，再清除记录和草稿；停止失败时保留会话。删除当前会话后自动选择相邻会话。后端管理的会话通过 `conversation.delete` 请求外部后端处理，外部后端应一并停止该会话的生成并删除已保存历史，确认后前端才清除本地记录；拒绝或超时会保留记录。删除后刷新不会恢复旧记录。处理方式见[删除会话](./office-integration.md#删除会话)。

清除站点数据后，浏览器可从聊天服务重新读取已保存的历史；未发送的本地草稿不会跨设备同步。纯前端预览和未实现历史能力的自定义源码适配器，只保存本地记录，刷新后将未完成内容标记为停止。会话切换不要求后端重新初始化办公室。

多个页面同时编辑同一会话时，通过浏览器事务校验存档版本。发生写入冲突，页面保留可见内容并提示临时保存；刷新后读取最新存档。读取失败时保留原记录，保存失败时显示提示并在后续保存时重试。

纯前端演示提供明确标注的交互预览。服务器模式始终调用 PixOffice 的聊天转发接口，未配置服务时显示配置缺失错误。输入框在当前会话生成中显示停止按钮；其他会话的运行状态显示在会话标签中。

## 自定义前端源码适配器

可运行 `npm run integration-chat-example` 启动一个完整实现四种操作的参考聊天服务，默认地址为 `http://127.0.0.1:8788/chat`。实现见 [`chat-server.mjs`](../clients/chat-server.mjs)。该示例不调用模型，数据保存在内存中，重启即清空；生产服务应使用业务引擎的持久存储。

直接集成 React 应用源码的开发者，可通过 `OfficeChatSource` 对接宿主已有的聊天客户端。示例中的 `myAgent` 和 `dataSource` 由宿主提供：

```tsx
import { OfficeApp, type OfficeChatSource } from './example/office-web/src/office'

const chatSource: OfficeChatSource = {
  kind: 'my-agent',
  async *stream(request, signal) {
    // Detach this receiver on abort; keep generation available for resume.
    yield* myAgent.stream(request, signal)
  },
  history: (request, signal) => myAgent.history(request, signal),
  resume: (request, signal) => myAgent.resume(request, signal),
  cancel: (request, signal) => myAgent.cancel(request, signal),
}

<OfficeApp dataSource={dataSource} chatSource={chatSource} />
```

`OfficeApp` 的源码入口为 [`example/office-web/src/office.ts`](../../example/office-web/src/office.ts)。自定义聊天源可用稳定的 `historyKey` 隔离历史记录，默认使用 `kind`。自定义办公室会话持久化实现 `ChatWorkspacePersistence.write(archive, expected)` 时，应原子校验 `expected`，冲突时抛出 `ChatStorageConflict`。

回复按 Markdown 展示，支持标题、列表、代码块、表格等，禁用原始 HTML 执行。复制和历史记录保留原始文本。聊天服务产生的业务变化由外部业务后端执行，再通过办公室 HTTP 接口更新任务或发送场景指令。
