# PixOffice 聊天流式接口

本文面向为 PixOffice 对话输入框提供回复的聊天服务开发者。浏览器向配置的聊天地址发送 HTTP POST，聊天服务以 NDJSON 流逐段返回文本。办公室初始化、任务和白板使用[办公室 HTTP 接入协议](./office-integration.md)；聊天服务为可选能力。

| 参与方 | 职责 |
| --- | --- |
| PixOffice 浏览器页面 | 维护办公室会话、发送上下文、显示增量回复、处理用户停止操作 |
| 聊天服务 | 接收聊天请求、调用模型或业务逻辑、返回流式事件，并响应请求取消 |

每个办公室拥有独立会话。切换办公室后，生成中的回复和输入草稿继续保留。

## HTTP 接入

将 `VITE_PIXOFFICE_CHAT_URL` 设置为聊天服务的完整地址，例如 `https://your-host.example/chat`，或由部署方提供的同源路径，例如 `/api/chat`。开发时设置后重启服务，生产部署时在构建前设置。该地址由聊天服务提供方实现；PixOffice Fastify 默认服务不提供聊天生成接口。

模型 API Key 由聊天服务保管。`VITE_*` 配置会进入浏览器构建产物，只适合存放公开配置。

浏览器以 `Content-Type: application/json` 发送以下请求体：

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

正常回复应输出文本并以 `done` 结束；提前断开或没有回复文本时，页面显示失败。`status` 只描述处理阶段。用户点击停止时浏览器中止请求，聊天服务应监听断开并取消上游生成。

请求字段和每条响应事件中的任何层级都禁止 `null`。字段定义见 [`chatRequestSchema` 和 `chatEventSchema`](../../packages/protocol/src/chat.ts)。

浏览器单次输入最多 4000 字符，一次回复最多 50000 字符，请求最长 180 秒。请求包含当前输入，以及最近最多 10 轮完整历史对话；历史部分总计最多 100000 字符。中断或失败的回复保留在页面中，不作为完整历史发送。HTTP 事件单行最多 32000 字符，其中 `delta.text` 最多 16000 字符。

跨域聊天服务需要配置 CORS。HTTP 适配器不跨域携带 Cookie，认证由部署方提供的同源代理或可信宿主处理。

## 历史与页面行为

浏览器按办公室和聊天服务地址，在当前站点的 IndexedDB 中保存完整会话、草稿和会话 ID。生成中的内容持续更新同一条消息，短周期合并保存，生成结束时立即保存。刷新页面后保留已生成部分并标记为停止；点击“新对话”清空该办公室的当前会话。记录仅存在于当前浏览器，清除站点数据会删除记录。

多个页面同时编辑同一会话时，通过浏览器事务校验存档版本。发生写入冲突，页面保留可见内容并提示临时保存；刷新后读取最新存档。读取失败时保留原记录，保存失败时显示提示并在后续保存时重试。

未配置聊天服务时，输入框提供明确标注的交互预览。配置服务后，输入框彩色边框跟随请求状态变化，在完成、取消、失败或超时后停止。

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

回复作为纯文本展示。聊天服务产生的业务变化由外部业务后端执行，再通过办公室 HTTP 接口更新任务或发送场景指令。
