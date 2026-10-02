# 插件化场景内核：实现与接入

项目品牌为 **PixOffice**，官网为 <https://pixoffice.online/>。为兼容既有接入与存档，旧版嵌入通道、地图格式标识和浏览器存储键保持不变；这些技术标识不是页面品牌名称。

本文件描述 `codex/scene-plugin-runtime` 分支实际实现的功能。`scene-protocol-v1.md` 是更完整的长期设计草案，两者不能混为已经完成的产品承诺。

## 运行

```bash
npm install
npm run dev
```

开发命令启动独立前端和本地测试网关；前端本身不需要运行服务端。

只启动前端：

```bash
npm run dev:vite
```

没有网关时，本地活动、插件管理和布局编辑仍可使用。`VITE_OFFICE_HTTP_ACTIONS_URL` 可指定旧动作源，其 origin 也作为新开发协议的网关地址。正式接入可以直接替换 `RuntimeHttpClient` 或使用嵌入适配器，不需要修改场景内核。

## 已实现的模块

```text
src/runtime/
  protocol.ts            Zod 协议、推导类型、JSON Schema、错误与回执
  model.ts               世界、人物、物品、模板、阶段、活动、检查点
  OfficeRuntime.ts       唯一状态写入入口、调度、取消、持久化协调
  plugins.ts             可信内置插件注册、依赖检查、启停、能力发现
  resources.ts           容量、原子预约、释放
  navigationAdapter.ts   可注入的寻路接口，不绑定算法或渲染器
  navigation.ts          默认四方向网格 A*、静态占地与可达性检查
  orthogonalPath.ts      横竖路径连接、简化与距离比较
  movement.ts            就近选位、人物间距、停步与动态重规划
  cellMovement.ts        相邻整数格移动与两端格预约\n  seatInteraction.ts     通用家具入口/使用格、局部通道与姿态过渡
  builtin/primitives.ts   不依赖工位的通用移动与发言
  builtin/officePack.ts   办公室数据包和行为插件
  adapters/              旧命令转换、HTTP、浏览器存储、受限嵌入消息
  index.ts               可供应用程序集成的 TypeScript 入口

src/scene/OfficeScene.ts  Pixi 场景适配与短暂拖动预览，不回写人物状态
src/runtime/map/         地图文档、共享编辑草稿、撤销重做与校验
src/components/map-editor/  图层、属性面板和画布编辑交互
src/scene/views/          可注册的物品视图工厂，未知视图使用占位
scripts/scene-gateway.mjs 可替换的本地开发网关
```

内核可在 Node 测试中运行，不导入 React、Pixi、DOM 或网络。浏览器应用当前用场景帧循环调用 `runtime.tick(dtMs)`；其他宿主可注入自己的时钟并主动推进。`dispose()` 取消活动、清空占用并取消待执行命令。

现有角色贴图、背面交替步态、坐姿、桌椅和办公室背景继续使用。旧模拟器与旧动作测试保留作兼容参考，但主场景已不再使用旧移动系统或从 Pixi 实体回读权威状态。

## 内置插件

| 插件 | 能力 | 当前行为 |
| --- | --- | --- |
| `scene.primitives` | `scene.move`、`scene.say` | 不依赖工位的通用移动与发言，可在资源兼容时边走边说 |
| `office.objects` | 工位、白板模板与场景内容 | 占地、锚点、资源、白板状态 Schema |
| `office.visits` | `office.visit` | 逐个拜访、每个对象独立消息与回应、接待人坐着转头交流、访客回座 |
| `office.meetings` | `office.meeting` | 2–4 人集合、到齐后讨论、返回各自工位 |
| `scene.furniture` | `furniture.use` | 预约家具、就近入口、到位使用、离开释放 |\n| `office.personal` | `office.focus`、`office.emote` | 持续专注；挥手、思考、惊讶 |

活动的阶段和表现由插件返回的计划定义；内核统一推进移动、持续时间、资源和结束流程。插件只能操作计划声明的参与者与资源，不拿到实际世界对象的可变引用。

当前采用保守的整场活动预约。例如拜访期间预约访客及全部接待人的身体与语音资源。移动目标锚点（含候选站位）自动预约，阶段开始时检查目标是否被人物或其他移动目标占据。互不冲突的活动可以并行；冲突活动有界排队，同资源后来的活动不能跳过前面的等待者。更细粒度的分阶段预约尚未实现。

拜访在每一站开始时，从左右和前方的候选交流格中选择总路程较短且可达的位置，途中被堵会重新比较入口。访客到达后，接待人保持原位坐姿，转头面向访客；访客发言、接待人回应，随后接待人转回电脑。接待人若不在座位，先正常回座，再让访客靠近。连续拜访只在最后返回访客自己的座位。

每一站可选传入 `reply` 作为接待人的回复；未传入时仅显示“访客姓名，收到。”的可视确认，不表示真实业务已接受或完成，也不会自动调用大模型。访客发言时长由 `durationMs` 指定，回复时长限制在 800–2000ms。

人物不必须绑定工位；通用移动与发言可以独立使用。只有回座、工位拜访等办公室能力要求座位绑定。默认人物待命，自动演示须手动开启，不代表真实业务正在执行。

## 已实现的协议

协议版本字段为 `2.0`，统一使用整数格坐标，以 `runtime.describe()` 返回的能力和 Schema 为准，不假定设计草案中的全部命令已存在。

| 命令 | 说明 |
| --- | --- |
| `activity.start` | 按能力 ID、参与者角色列表和具名参数启动活动 |
| `activity.stop` | 按活动 ID 结束活动并释放资源 |
| `command.cancel` | 取消排队或执行中的有限命令 |
| `actor.presentation.set` | 使用递增来源版本更新业务展示，不打断移动 |
| `object.state.set` | 使用状态版本更新插件允许修改的字段 |
| `layout.apply` | 使用布局版本原子提交全部物品位置 |
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
    { "entityId": "marvis", "role": "visitor" },
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
  "params": { "title": "整理本轮资料" }
}
```

启动成功后该命令返回 `completed` 和 `activityId`，活动本身仍是 `active`。通过 `activity.stop` 结束，不应把成功的启动命令改回取消状态。当前持续专注上限为一小时，避免无限占用。

```json
{
  "protocolVersion": "2.0",
  "sceneId": "office-1",
  "commandId": "stop-focus-001",
  "type": "activity.stop",
  "activityId": "focus-001"
}
```

有限活动的启动命令会保持 `running`，直到活动完成、失败或取消。排队有默认两分钟期限；有限活动有默认两分钟执行超时，可以在允许范围内指定 `expiresAt`、`timeoutMs`、`busyPolicy`。

### 批量执行

`runtime.submitBatch({ mode, commands })` 支持 `sequence` 和 `parallel`，最多 32 条。每条命令都有独立 ID 和结果；批次不是全有或全无的事务。

顺序批次通过前置命令依赖执行，前一步失败则后续报告 `DEPENDENCY_FAILED`。这里等待的是命令完成，不是持续活动结束：持续活动的启动回执完成后，其资源仍占用，后续冲突动作继续排队。

## 外部项目接入

本地网关默认绑定 `127.0.0.1:8765`。以非默认端口运行时替换下面地址。

```bash
curl -X POST http://127.0.0.1:8765/scene/commands \
  -H 'Content-Type: application/json' \
  -d '{"protocolVersion":"2.0","sceneId":"office-1","commandId":"hello-001","type":"activity.start","capability":"office.emote","participants":[{"entityId":"marvis","role":"actor"}],"params":{"animation":"emotes/wave"}}'

curl http://127.0.0.1:8765/scene/commands/hello-001
curl http://127.0.0.1:8765/scene/state
curl http://127.0.0.1:8765/scene/events
curl http://127.0.0.1:8765/scene/capabilities
```

HTTP 202 仅表示网关收到命令，不表示前端执行成功。查询命令结果或观察 `command.status`、`activity.phase`、`activity.ended` 事件。

开发网关提供非破坏性拉取、单独收件回执、事件去重、执行实例租约与重启 epoch。第二个页面不会同时消费新协议命令。原来的 `/actions` 接口继续可用，但仍是旧的单消费者、破坏性轮询，不具备这些保证。

生产接入需要自行实现认证、持久队列、可靠事件发件箱、完整租约/世代隔离和跨重启对账。该开发网关不是生产业务服务，队列存储在内存中，重启会丢失尚未被前端接收的命令。

嵌入页面时可设置 `VITE_OFFICE_PARENT_ORIGIN`，只接受该精确 origin 且来源为父窗口的 `ai-office.v1` 消息。支持 `describe`、`snapshot`、`command` 和 `batch` 请求，每次带 `requestId`。这也是受信任宿主接入，不是对任意第三方开放的权限系统。

## 添加可信能力插件

在应用程序启动时，将实现 `ScenePlugin` 的模块加入 `OfficeRuntime` 的 `plugins` 参数。注册时检查 API 版本、依赖是否已注册、能力和模板 ID 是否冲突。依赖顺序由应用程序集成方确定。

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

地图、人物占地、家具占地、寻路和编辑器现在统一成整数格，不再保留独立的精细行走网格。两格之间的平滑位移只由 `src/scene/gridProjection.ts` 投影。逐格预约、家具互动、排队、取消收尾和迁移规则见[整数格与家具互动](./integer-grid-and-interactions.md)。

## 编辑与存储

椅子保持固定；人物通过 `rising → exiting → 行走 → aligning → entering → sitting` 完成离座与入座。视图继续播放现有完整人物帧图，不新增骨骼运行时，也不重做人物素材。工位绑定和编辑方式保持不变。

自动演示由 `src/scene/systems/officeDemo.ts` 生成轮转搭档：默认六人分成三组并行互访，下一轮交换访客与接待人，再更换搭档。十轮覆盖全部 30 种有方向的同事组合，每个人都会走动、接待与回应。每组使用正式 `office.visit` 命令，共用资源锁、避让、座位交互及口型逻辑，不直接修改人物坐标。奇数人数每轮留一人待命，随后轮换；未绑定工位的人物不参与工位演示。

演示仅在手动开启后运行；等待已有活动、排队命令与座位清理结束才开始下一轮。停止演示后不再派新轮次，已开始的交接正常收尾；命令被拒绝或执行失败时停止并显示错误。它是动作演示，不代表真实业务任务。

对外的连续批量派发仍应使用一个 `office.visit` 的 `stops` 列表（或旧接口 `desk_visit_tour`），逐站交接后直接前往下一位同事，仅全部交接结束后返回访客座位。不要将多条独立拜访命令当作同一个行程；独立拜访保留各自返回工位的语义。

场景无活动、无等待命令且座位交互收尾完成后可以进入编辑。鼠标拖动先展示短暂预览，松手后通过 `map.edit` 修改内核共享草稿。HTTP / iframe 使用同一命令；每次写入检查草稿 ID 和版本。草稿校验边界、碰撞、入座通道、锚点可达性与人物绑定，正式应用时再次校验。工位桌椅整体移动，人物仍逻辑绑定座位。

保存成功后更新导航数据、对象资源和人物座位。取消编辑不改变正式布局。界面采用全屏房间布置、底部家具目录与选中浮层，人工摆放使用 `requireValid: true` 原子校验，非法位置回原位。地图协议仍支持地面边界、历史禁行区、交互锚点、人物绑定、撤销 / 重做、JSON 导入导出和静态路线预览；日常界面不再展示禁行区或坐标工具。暂不提供旋转 / 缩放、多楼层和凹多边形地面。`layout.apply` 保留兼容，但共享草稿打开时禁止绕过草稿直接覆盖布局。具体操作与协议见[地图编辑器](./map-editor.md)。

浏览器以场景 ID 隔离检查点，存储键为 `ai-office:plugin-runtime:v1:<sceneId>`。保存布局、物品状态、人物业务展示和有界命令记录。恢复时不继续播放旧路径或恢复预约，排队命令报告重启中断；执行中命令的最终结果无法确认，报告 `OUTCOME_UNKNOWN`；持续活动另发结束事件。

去重记录最多 512 条，事件窗口最多 256 条，活动历史有界。去重承诺仅覆盖保留记录；不是永久去重或恰好执行一次。坏存档、版本不匹配、存储满时保留原存档并拒绝新命令，不静默覆盖。

若存档结构、场景和插件版本都有效，仅旧摆放位置不满足当前碰撞或椅侧通道规则，页面会在可安全恢复时提供“备份并恢复布局”。点击后先把原始存档完整保存在 `ai-office:plugin-runtime:v1:<sceneId>:backup:<timestamp>:<uuid>`，再恢复默认物品位置；保留人物、绑定、物品内容和命令记录，不重放中断任务。备份或保存失败、原存档被其他页面修改时不会解锁执行，也不会覆盖原数据。此入口仅支持与当前初始场景具有相同实体 ID 和模板的存档，不替代跨插件版本的迁移器。

## 已知边界

- 当前为单层 A* 加轻量人物避让；尚未实现拥挤人群的协商让路、推车体积导航、跨楼层移动和多人共同搬运。
- 多人活动支持集合和同步阶段，不支持中途增加参与者或动态重构活动计划。
- 工位仍作为一个可移动组合模板；尚未实现任意附件关系图和独立椅子的生命周期。
- 素材模板来自本分支。背景图中画死的柜子、植物和门还不是独立可交互对象。
- 插件版本采用精确检查；已提供旧连续单位 v1 存档到整数格 v2 的专用迁移器，先完整备份再保存。其他插件版本仍需单独迁移。
- 真实任务系统、业务权限、远程模型和行业业务规则不在这个前端内核内。

## 验证

```bash
npm test
npm run lint
npm run build
```

测试覆盖纯内核行为、参与者资源竞争、取消/超时、持续活动、参数和版本校验、插件启停、布局事务、存档保护、HTTP 回执与租约。已有帧动画和旧 HTTP 兼容测试继续运行。

实现使用 [Zod 的类型与 JSON Schema 转换](https://zod.dev/json-schema) 和 [PathFinding.js 的网格 A*](https://github.com/qiao/PathFinding.js)，没有另写一套寻路算法或字符串动作解析器。
