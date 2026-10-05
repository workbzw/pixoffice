# 业务页面数据接入

页面现在区分两套状态：**业务快照**决定顶部指标、员工、任务流和动态；**场景内核**负责人物、家具、寻路与动作。外部项目只需提供业务快照和业务操作，不必修改 Pixi 动画代码。页面默认展示可交互的示例数据；这些数字不是来自真实业务系统。

## 快速联调

在两个终端运行：

```bash
npm run dashboard-example
VITE_OFFICE_DASHBOARD_URL=http://127.0.0.1:18770 npm run dev
```

打开 Vite 输出的网址。示例业务服务只监听 `127.0.0.1:18770`，数据保存在进程内；重启后重置。也可将 `VITE_OFFICE_DASHBOARD_URL` 改成自己的服务地址。此变量不设置时，页面使用内存中的示例数据。`VITE_OFFICE_HTTP_ACTIONS_URL` 是另一条接口，用于驱动场景动作，不是业务快照接口。

## HTTP 契约 1.0

`GET <baseUrl>/snapshot` 返回完整 JSON 快照。示例：

```json
{
  "schemaVersion": "1.0",
  "workspace": { "id": "team-a", "name": "市场情报空间" },
  "employees": [
    { "id": "leader", "sceneActorId": "marvis", "name": "王明", "role": "负责人", "online": true },
    { "id": "researcher", "sceneActorId": "code-agent", "name": "李研", "role": "信息检索", "online": true }
  ],
  "tasks": [
    { "id": "task-1", "title": "跟踪竞品新品", "assigneeId": "researcher", "status": "running", "progress": 45, "updatedAt": "2026-09-30T10:00:00.000Z", "summary": "整理今日上新信息" }
  ],
  "events": [
    { "id": "event-1", "kind": "task.assigned", "taskId": "task-1", "employeeId": "researcher", "fromEmployeeId": "leader", "summary": "王明分配了任务", "occurredAt": "2026-09-30T10:00:00.000Z" }
  ]
}
```

- 员工 `id` 是业务 ID；`sceneActorId` 才是办公室人物 ID。省略 `sceneActorId` 的员工仍可出现在列表，但不会驱动人物。当前办公室人物 ID：`marvis`、`code-agent`、`file-agent`、`app-agent`、`review-agent`、`data-agent`。
- 任务状态可用 `queued`、`running`、`blocked`、`completed`、`failed`。`progress` 是可选的 0 到 100；没有真实进度时省略，不要伪造百分比。
- `updatedAt`、`occurredAt` 使用带时区的 ISO 8601 时间。`events` 应按新到旧排序，事件 `id` 在工作空间内保持稳定。`task.assigned` 事件可触发负责人走到员工身旁；页面首次加载时不会重放历史交接。
- `system` 可选，格式为 `{ "cpuPercent": 39, "memoryPercent": 65, "networkKbps": 15 }`。不提供时页面显示“未提供”，不生成假监控值。
- 员工、任务 ID 不得重复；任务 `assigneeId` 必须引用快照中的员工。客户端使用 Zod 校验整个响应，错误会在页面提示。

`POST <baseUrl>/actions` 接收以下一种 JSON，服务端负责鉴权、状态转换、持久化和审计；返回任意 2xx 表示成功，非 2xx 表示失败。页面随后重新获取快照。

```json
{ "type": "task.assign", "taskId": "task-1", "assigneeId": "researcher" }
```

另外三种类型为 `task.start`、`task.block`、`task.complete`，消息体包含 `type` 和 `taskId`。不要把场景动作命令发到这个接口。

HTTP 适配器每 3 秒轮询；业务源也可直接实现 [`OfficeDataSource`](../example/office-web/src/dashboard/contract.ts) 的 `getSnapshot`、`subscribe`、`execute`，再传入 [`OfficeApp`](../example/office-web/src/App.tsx) 的 `dataSource` 属性，不必采用 HTTP 或修改场景内核。可从 [`office.ts`](../example/office-web/src/office.ts) 导入组件、类型和内置适配器。`kind` 是开放字符串，方便标识自定义来源。业务 UI 保留为示例源码，内核和渲染能力已拆成五个包；均尚未发布 npm。

## 边界

[`sceneBridge.ts`](../example/office-web/src/dashboard/sceneBridge.ts) 只把业务状态投影为人物显示文本，并在新分配事件出现时触发一次工位拜访。人物抵达、说话或动画结束**不会**自动将业务任务标为完成；业务系统仍是任务状态唯一权威。场景协议与地图编辑接口见[插件运行时文档](./plugin-runtime.md)。

此仓库的示例服务仅用于本地联调，没有用户认证、持久化或生产权限控制。接入真实数据时，这些必须由宿主业务服务提供。
