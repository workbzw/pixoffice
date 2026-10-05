# 办公室聊天接入

底部输入框和对话面板独立于场景内核。展开、收起不会重建办公室，覆盖时暂停绘制但继续运行场景逻辑。对话仅保存在本次页面会话中，刷新后清空，不写入地图存档。编辑布局时隐藏聊天入口。

未配置服务时使用明确标注的交互预览。预览不调用模型、不分析输入、不派发任务，也不修改业务数据。彩色边框由真实请求状态控制，完成、取消、失败或超时后停止。系统减少动态效果时显示静态彩色边框。

## HTTP 接入

设置 `VITE_PIXOFFICE_CHAT_URL=https://your-host.example/chat` 后重启开发服务。也可以使用同源路径 `/api/chat`。模型 API Key 放在自己的服务端，不放入 `VITE_*` 环境变量。

前端 POST JSON：

```json
{
  "version": "1.0",
  "conversationId": "uuid",
  "messages": [{ "role": "user", "content": "查看本周的工作情况" }]
}
```

服务返回 `Content-Type: application/x-ndjson`，每行一个 JSON 事件：

```jsonl
{"type":"status","phase":"thinking"}
{"type":"delta","text":"本周"}
{"type":"delta","text":"的工作情况如下……"}
{"type":"done"}
```

`status` 可为 `thinking` 或 `streaming`，只表示处理状态，不要求返回内部推理。服务出错时返回 `{"type":"error","message":"简明错误原因"}`。必须发送 `done` 表示正常完成，提前断开会显示错误，不冒充成功。停止按钮会中止客户端请求；服务应监听断开并取消其上游模型请求。跨域服务需要配置 CORS。当前适配器不跨域携带 Cookie，身份认证由可信宿主或同源代理负责。

单次输入最多 4000 字符，回复最多 50000 字符，请求最长 180 秒。上下文最多保留最近 10 轮完整对话、100000 字符，不把失败或取消的回复发给模型。HTTP 事件单行限制 32000 字符，其中 `delta.text` 最多 16000 字符。

## SDK 注入

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

这里的 OfficeApp 是完整示例应用的源码入口，不是已发布的 UI 包。回复以纯文本安全展示，不执行 HTML、脚本或模型生成的场景命令。任务派发仍属于宿主业务系统，由宿主通过现有业务数据源和场景协议接入。
