# 场景运行时 SDK 与命令协议

本文面向直接使用 `SceneRuntime` 或开发场景插件的前端开发者，定义场景命令、运行时结果和扩展接口。外部业务后端通过 HTTP 接入时，使用[办公室 HTTP 接入协议](../integration/docs/office-integration.md)。

下文 JSON 命令可传入 `runtime.submit(command)`；HTTP 发送时，将命令放入 `{teamId, command}` 的 `command` 字段。SDK 返回命令执行状态，HTTP 动画接口返回转发结果，二者的字段和返回时机不同。

## 运行

```bash
npm install
npm run dev
```

开发命令启动 Vite 和同仓库 Fastify 消息转发服务。静态演示不需要服务端；Docker 使用同一前端产物并开启真实对接。

站点首页 `/` 展示项目介绍。服务器业务联调使用 `/office/`；`/minimal/` 提供独立的最小场景装配示例。

只启动前端：

```bash
npm run dev:vite
```

纯静态部署展示本地演示数据。服务器部署使用 Fastify HTTP 接口和浏览器 SSE，浏览器运行时管理动画队列。Docker 和联合开发模式通过 `/pixoffice-config.js` 配置连接，详见[部署文档](../integration/docs/message-relay.md)。

## 已实现的模块

```text
packages/runtime/src/
  model.ts               世界、人物、物品、模板、阶段、活动、检查点
  SceneRuntime.ts        唯一状态写入入口、调度、取消、持久化协调
  plugins.ts             可信内置插件注册、依赖检查、启停、能力发现
  resources.ts           容量、原子预约、释放
  navigationAdapter.ts   可注入的寻路接口，不绑定算法或渲染器
  navigation.ts          默认四方向网格 A*、静态占地与可达性检查
  orthogonalPath.ts      横竖路径连接、简化与距离比较
  movement.ts            就近选位、人物间距、停步与动态重规划
  cellMovement.ts        相邻整数格移动与两端格预约
  seatInteraction.ts     通用家具入口/使用格、局部通道与姿态过渡
  builtin/primitives.ts   不依赖工位的通用移动与发言
  adapters/              SSE、消息路由、浏览器存储
  index.ts               可供应用程序集成的 TypeScript 入口

packages/protocol/src/          Zod 命令、业务、UI 与返回结构 Schema
packages/scene-office/src/core/  办公室数据包和行为插件
packages/renderer-pixi/src/SceneView.ts  Pixi 场景适配与短暂拖动预览
packages/runtime/src/map/       地图文档、共享编辑草稿、撤销重做与校验
example/office-web/src/components/map-editor/  画布编辑 UI
packages/scene-office/src/pixi/views/  办公室物品视图工厂
server/src/             Fastify 接口、最新业务快照缓存、连接表、等待中的业务请求和静态页面服务
```

内核可在 Node 测试中运行，不导入 React、Pixi、DOM 或网络。浏览器应用当前用场景帧循环调用 `runtime.tick(dtMs)`；其他宿主可注入自己的时钟并主动推进。`dispose()` 取消活动、清空占用并取消待执行命令。

人物动作通过动画适配器播放，场景规则与图片播放实现分别由 `SceneRuntime` 和 `FrameAdapter` 管理。

## 内置插件

| 插件 | 能力 | 当前行为 |
| --- | --- | --- |
| `scene.primitives` | `scene.move`、`scene.say` | 不依赖工位的通用移动与发言，可在资源兼容时边走边说 |
| `office.objects` | 工位、白板模板与场景内容 | 占地、锚点、资源、白板状态 Schema |
| `office.visits` | `office.visit` | 逐个拜访、每个对象独立消息与回应、接待人坐着转头交流、访客回座 |
| `office.meetings` | `office.meeting` | 2–4 人集合、到齐后讨论、返回各自工位 |
| `scene.furniture` | `furniture.use` | 预约家具、就近入口、到位使用、离开释放 |
| `office.personal` | `office.focus`、`office.emote` | 持续专注；挥手、思考、惊讶 |

活动的阶段和表现由插件返回的计划定义；内核统一推进移动、持续时间、资源和结束流程。插件只能操作计划声明的参与者与资源，不拿到实际世界对象的可变引用。

当前采用保守的整场活动预约。例如拜访期间预约访客及全部接待人的身体与语音资源。移动目标锚点（含候选站位）自动预约，阶段开始时检查目标是否被人物或其他移动目标占据。互不冲突的活动可以并行；冲突活动有界排队，同资源后来的活动不能跳过前面的等待者。更细粒度的分阶段预约尚未实现。

拜访在每一站开始时，从左右和前方的候选交流格中选择总路程较短且可达的位置，途中被堵会重新比较入口。访客到达后，接待人保持原位坐姿，转头面向访客；访客发言、接待人回应，随后接待人转回电脑。接待人若不在座位，先正常回座，再让访客靠近。连续拜访只在最后返回访客自己的座位。

每一站可选传入 `reply` 作为接待人的回复；未传入时仅显示“访客姓名，收到。”的可视确认，不表示真实业务已接受或完成，也不会自动调用大模型。访客发言时长由 `durationMs` 指定，回复时长限制在 800–2000ms。

人物不必须绑定工位；通用移动与发言可以独立使用。只有回座、工位拜访等办公室能力要求座位绑定。默认人物待命，自动演示须手动开启，不代表真实业务正在执行。

### 闲时表现

`core.leisure` 是展示层的通用闲时动画语义，不是 `activity.start` 的能力名称。人物真正空闲时，由办公室、教室或农场的展示包选择该语义，素材包决定具体动作；没有专用素材则保持相同姿态和朝向的中性待机。它不创建命令、不占用资源、不修改任务或存档，参与活动、工作、移动、交谈和编辑时立即停止。场景内核和外部协议没有新增“喝咖啡”命令。素材槽位见[人物资源包](./character-packs.md#闲时动作)。

## 命令格式与本地结果

命令的 `protocolVersion` 固定为 `"2.0"`，场景位置采用地面整数格坐标。`runtime.describe()` 返回场景能力与参数的 JSON Schema；HTTP 接入可通过 `office.capabilities` 或 `office.read` 获取。

| 命令 | 说明 |
| --- | --- |
| `activity.start` | 按能力 ID、参与者角色列表和具名参数启动活动 |
| `activity.stop` | 按活动 ID 结束活动并释放资源 |
| `command.cancel` | 取消排队或执行中的有限命令 |
| `actor.presentation.set` | 使用递增来源版本更新业务展示，不打断移动 |
| `object.state.set` | 使用状态版本更新插件允许修改的字段 |
| `map.edit` | 人与 AI 共用的地图草稿、原子修改、撤销重做、预检与应用 |

未知字段、错误参数和不支持的能力会被拒绝。所有命令都要求 `protocolVersion`、`sceneId` 和 `commandId`。同 ID、相同规范化内容返回已有结果；同 ID 不同内容报冲突。

### 连续拜访，每个人独立消息

```json
{
  "protocolVersion": "2.0",
  "sceneId": "office-1",
  "commandId": "handoff-001",
  "type": "activity.start",
  "capability": "office.visit",
  "participants": [
    { "entityId": "office-lead", "role": "visitor" },
    { "entityId": "code-agent", "role": "host" },
    { "entityId": "file-agent", "role": "host" }
  ],
  "params": {
    "stops": [
      { "hostId": "code-agent", "message": "请核对信息来源。", "reply": "收到，我来核对。" },
      { "hostId": "file-agent", "message": "请整理交付资料。", "reply": "收到，我来整理。" }
    ],
    "durationMs": 3000
  }
}
```

### 开始与结束持续活动

```json
{
  "protocolVersion": "2.0",
  "sceneId": "office-1",
  "commandId": "focus-001",
  "type": "activity.start",
  "capability": "office.focus",
  "participants": [{ "entityId": "app-agent", "role": "worker" }],
  "params": { "title": "整理项目资料" }
}
```

`runtime.submit()` 成功启动持续活动后，命令结果为 `completed` 并包含 `activityId`，表示启动操作完成；活动状态为 `active`，通过 `activity.stop` 结束。持续专注的最长持续时间为一小时。

```json
{
  "protocolVersion": "2.0",
  "sceneId": "office-1",
  "commandId": "stop-focus-001",
  "type": "activity.stop",
  "activityId": "focus-001"
}
```

有限活动的启动命令会保持 `running`，直到活动完成、失败或取消。排队有默认两分钟期限，按实际时间判断；有限活动有默认两分钟执行超时，按运行时实际推进的动画时间累计，浏览器暂停或休眠的时间不计入。可以在允许范围内指定 `expiresAt`、`timeoutMs`、`busyPolicy`。

活动等待队列达到 128 条时，新活动会被拒绝。`command.cancel` 和 `activity.stop` 使用预留的控制命令容量，可用于解除拥堵，同时执行场景、目标、依赖和命令 ID 校验。

### 批量执行

`runtime.submitBatch({ mode, commands })` 支持 `sequence` 和 `parallel`，最多 32 条。每条命令都有独立 ID 和结果；批次不是全有或全无的事务。

顺序批次通过前置命令依赖执行，前一步失败则后续报告 `DEPENDENCY_FAILED`。持续活动的启动命令完成后，该活动继续占用资源，后续有冲突的动作进入等待队列。

## 外部项目接入

### 寻路失败诊断

移动失败返回错误码 `NO_ROUTE`，可同时包含 `reasonCode` 和 `details`。页面提示、SDK 命令结果、运行时事件和存档可读取这些诊断字段。HTTP 动画接口不返回执行中的寻路诊断。

| 原因码 | 含义 |
| --- | --- |
| `TARGET_OCCUPIED` | 目标格被停留人物占用 |
| `TARGET_RESERVED` | 目标格已被同一阶段的其他移动选中 |
| `DEPARTURE_OCCUPIED` | 离开当前家具的局部通道被人物占用或预订 |
| `DEPARTURE_ENTRY_UNAVAILABLE` | 当前家具没有合法离开入口 |
| `ARRIVAL_ENTRY_UNAVAILABLE` | 目标家具没有合法进入入口 |
| `START_BLOCKED` / `TARGET_BLOCKED` | 寻路起点或终点不可通行 |
| `PATH_DISCONNECTED` | 起点与终点没有连通路径 |
| `PATH_UNAVAILABLE` | 导航适配器失败但未提供更细的原因码，原始错误保留在 `cause` |
| `MULTIPLE_ROUTE_FAILURES` | 不同候选格因不同原因失败，不能归结为单一原因 |

`details` 包含 `actorId`、`targetId`、`from` 和逐个候选位置的 `failures`；每项含入口 `anchor`、格子 `position`、原因码和说明。人物占用还包含阻挡人物 ID、姓名及实际占用/预订的格子。多个候选位置的失败原因全部保留，不仅报告最后一次尝试。

诊断字段描述失败时的场景情况；等待、重规划和取消行为由运行时规则决定。

### 消息投递

PixOffice Fastify 服务接收 `POST /api/pixoffice/messages`，通过浏览器 SSE 发送消息。办公室主入口使用工作区订阅，独立场景可按团队订阅。调用样例和密钥配置见[消息转发与部署](../integration/docs/message-relay.md)。

每页只有一条场景 SSE，按团队 ID 路由到既有运行时。多个在线页面分别收到消息，各页独立视觉执行，不承诺动画同步。临时动画不保存历史、不补播；办公室业务状态由最新快照缓存恢复，首次连接或重连自动同步，见[业务接入](../integration/docs/office-integration.md)。

HTTP 动画请求返回 `200` 表示已写入至少一个在线页面连接。场景执行结果保存在浏览器运行时中，可由源码宿主读取。外部业务后端管理业务完成状态，并通过完整快照同步。

本地诊断通过页面导出或运行时 `snapshot()` / `describe()` 获取。HTTP 动画转发接口不提供地图事务执行结果查询。

## 添加可信能力插件

在应用程序启动时，将实现 `ScenePlugin` 的模块加入 `SceneRuntime` 的 `plugins` 参数。注册时检查 API 版本、依赖是否已注册、能力和模板 ID 是否冲突。依赖顺序由应用程序集成方确定。

每个能力提供：

- `id`、名称和 Zod 参数 Schema。
- `build(context, params)`，读取世界副本和参与者角色。
- 活动计划：声明资源、阶段、移动锚点、姿态、发言与持续时间。

视图通过 `PropViewRegistry.register(viewId, factory)` 注册，模板只引用 `viewId`。办公室视图不需要知道未来的饮水机或设备类型，未知视图会显示占位。工位视图复用原有桌椅 PNG；白板视图渲染实时内容。

第一版只允许随应用发布的可信代码。插件异常可以结束对应活动并释放资源，但同线程恶意代码或死循环不能被安全隔离；没有实现远程安装、任意脚本执行、代码沙箱或插件市场。含已实例化模板的插件暂不允许关闭，行为插件也不能在被活动或队列使用时关闭。

## 可替换的寻路适配器

内核只依赖 `NavigationAdapter`：解析锚点、检查通行、生成逐格路径和验证布局。默认实现使用 PathFinding.js 的四方向 A*，路径等长时优先少转弯。查询障碍也是整数格；`contact` 只授权指定家具的指定交互使用格，`within` 限定局部进出通道。普通路由不能穿过家具，外部命令不能指定碰撞豁免。

`createOfficeRuntime` 在装配层提供默认实现，也允许注入另一种导航算法：

```ts
const runtime = createOfficeRuntime({
  createNavigation: templates => new GridNavigation(templates),
})
```

将工厂返回值换成其他 `NavigationAdapter` 即可替换算法，不改人物和行为插件。每条路径不包含起点，以精确目标格结束，相邻点必须是上下左右一格；无路抛出 `SceneFault('NO_ROUTE', ...)`，适配器不得修改世界。

地图、人物占地、家具占地、寻路和编辑器统一使用整数格。表现层对相邻格之间的位移进行平滑插值。逐格预约、家具互动、排队与取消规则见[整数格与家具互动](./integer-grid-and-interactions.md)。

## 编辑与存储

人物通过 `rising → exiting → 行走 → aligning → entering → sitting` 完成离座与入座，过程中椅子保持固定。人物由完整图片帧播放；工位模板提供座位绑定和交互入口。

自动演示由 `example/office-web/src/dashboard/OfficeDemoSource.ts` 生成轮转搭档：默认六人分成三组并行互访，下一轮交换访客与接待人，再更换搭档。每组使用正式 `office.visit` 命令，共用资源锁、避让、座位交互及口型逻辑，不直接修改人物坐标。真实数据模式不启用该演示源。

演示仅在手动开启后运行；等待已有活动、排队命令与座位清理结束才开始下一轮。停止演示后不再派新轮次，已开始的交接正常收尾；命令被拒绝或执行失败时停止并显示错误。它是动作演示，不代表真实业务任务。

对外的连续批量派发使用一个 `office.visit` 的 `stops` 列表，逐站交接后直接前往下一位同事，仅全部交接结束后返回访客座位。不要将多条独立拜访命令当作同一个行程；独立拜访保留各自返回工位的语义。

场景无活动、无等待命令且座位交互收尾完成后可以进入编辑。鼠标拖动先展示短暂预览，松手后通过 `map.edit` 修改内核共享草稿。页面操作与源码宿主使用同一命令；每次写入检查草稿 ID 和版本。草稿校验边界、碰撞、入座通道、锚点可达性与人物绑定，正式应用时再次校验。工位桌椅整体移动，人物保持座位绑定。

保存成功后更新导航数据、对象资源和人物座位。取消编辑不改变正式布局。界面采用全屏房间布置、底部家具目录与选中浮层，人工摆放使用 `requireValid: true` 原子校验，非法位置回原位。地图协议支持地面边界、禁行区、交互锚点、人物绑定、撤销 / 重做、JSON 导入导出和静态路线预览；日常界面不展示禁行区或坐标工具。暂不提供旋转 / 缩放、多楼层和凹多边形地面。布局修改使用 `map.edit` 草稿事务，具体操作与协议见[地图编辑器](./map-editor.md)。

浏览器以产品命名空间和场景 ID 隔离检查点，默认存储键为 `pixoffice:classic:runtime:v2:<sceneId>`。检查点格式为 `version: 2`，内部命令为 `protocolVersion: "2.0"`，包含布局、物品状态、人物业务展示和有界命令记录。恢复时清除中断的路径与资源预约，排队命令报告重启中断，执行中命令报告 `OUTCOME_UNKNOWN`，持续活动产生结束事件。

去重记录最多 512 条，事件窗口最多 256 条，活动历史有界。去重承诺仅覆盖保留记录；不是永久去重或恰好执行一次。坏存档、版本不匹配、存储满时保留原存档并拒绝新命令，不静默覆盖。

存档中的活动元数据与命令记录统一使用 512 条容量；128 条是等待执行额度，不是可恢复活动的总数。恢复还检查命令 ID、场景归属及活动引用是否一致，重复或错配时保留原存档并明确报错。运行时事件回调中可以停止活动或销毁场景，已结束的阶段不会继续应用效果；地图变化通知发出前，其提交命令已标记完成。

若存档结构、场景和插件版本都有效，仅摆放位置不满足碰撞或椅侧通道规则，页面会在可安全恢复时提供“备份并恢复布局”。点击后先把原始存档完整保存在 `pixoffice:classic:runtime:v2:<sceneId>:backup:<timestamp>:<uuid>`，再恢复默认物品位置；保留人物、绑定、物品内容和命令记录。备份或保存失败、原存档被其他页面修改时保留原数据。此入口要求存档与当前初始场景具有相同的实体 ID 和模板。

## 已知边界

- 当前为单层 A* 加轻量人物避让；尚未实现拥挤人群的协商让路、推车体积导航、跨楼层移动和多人共同搬运。
- 多人活动支持集合和同步阶段，不支持中途增加参与者或动态重构活动计划。
- 工位仍作为一个可移动组合模板；尚未实现任意附件关系图和独立椅子的生命周期。
- 背景图片中的柜子、植物和门是静态内容，不具备独立交互能力。
- 检查点与插件版本精确匹配；格式或版本不匹配的存档和导入数据会被拒绝。
- 真实任务系统、业务权限、远程模型和行业业务规则不在这个前端内核内。

## 验证

```bash
npm test
npm run lint
npm run build
```

测试覆盖内核行为、参与者资源竞争、取消与超时、持续活动、参数和版本校验、插件启停、布局事务、存档保护、Fastify HTTP 与 SSE、多团队路由、认证、在线动画转发及帧播放。

实现使用 [Zod 的类型与 JSON Schema 转换](https://zod.dev/json-schema) 和 [PathFinding.js 的网格 A*](https://github.com/qiao/PathFinding.js)，没有另写一套寻路算法或字符串动作解析器。
