# PixOffice

![PixOffice 页面预览](./docs/page-preview.jpeg)

独立版 AI 办公室前端项目，Vite + React + Pixi。页面采用可替换的业务数据源展示指标、任务与员工；场景内核通过版本化协议和可信内置插件驱动人物、物品与活动。未接入业务服务时使用明确标识的示例数据。

保留原有人物帧动画、坐姿和办公室素材，支持工位拜访、多人会议、持续专注、白板内容、插件启停和网格拖放布局。

地图与人物行走统一使用整数格：人物 1×1 格、桌椅 2×2 格、白板 2×1 格。家具通过入口格、使用格和资源预约驱动互动；平滑动画只在渲染层插值。当前命令协议为 `2.0`，详见[整数格与家具互动](./docs/integer-grid-and-interactions.md)。

[业务页面数据接入](./docs/dashboard-integration.md) · [插件架构、场景协议与外部接入](./docs/plugin-runtime.md) · [地图编辑器与 AI 编辑协议](./docs/map-editor.md) · [长期协议设计草案](./docs/scene-protocol-v1.md)

## 地图编辑

办公室左上角网格按钮进入全屏「布置办公室」：从底部家具目录选取素材，拖动家具并吸附地面网格，选中后可复制、收起或调整工位所属人物。非法摆放自动回原位；支持撤销 / 重做，高级菜单提供 JSON 导入导出与路线测试。外部 AI 可通过同一套 `map.edit` 协议修改共享草稿，不需要模拟鼠标。

## 人物资源包

现有六个人已迁移为独立资源包：`art/characters/packs/<人物ID>/`。每个动作独立维护，构建时自动生成图集、帧坐标和人物注册表，办公室与预览共用尺寸、锚点和动作采样协议。

```bash
npm run characters:build  # 检查准入并打包正式人物
npm run characters:check  # 校验源素材与生成资源是否一致
```

`npm run dev`、`npm run build`、`npm test` 会先自动打包。生成目录 `public/characters/` 不纳入 Git；旧图集保留为来源记录，正常帧动画不再直接加载它们。

[人物配置与动作规范](./docs/character-packs.md) · [新增人物、素材验收与发布流程](./docs/character-admission.md)

新增或修改人物必须先在暂存目录完成 `characters:draft → characters:audit → characters:preview → characters:review → characters:publish`。工作帧检查身体静止、步态检查循环连续性，发布需要绑定该素材版本的视觉验收。现有六人按原内容冻结兼容，并不代表历史素材已通过新标准；本轮未修改图片。

注意素材版权问题！




## 运行

```bash
npm install
npm run dev
```

页面顶部指标、左侧员工、右侧任务流由业务数据源驱动。要接入一个独立的示例业务进程，另开终端执行 `npm run dashboard-example`，再以 `VITE_OFFICE_DASHBOARD_URL=http://127.0.0.1:18770 npm run dev` 启动页面。接口格式和自定义适配器见[业务页面数据接入](./docs/dashboard-integration.md)。

默认使用 HTTP 驱动员工动作。`npm run dev` 会同时启动：

- Vite 前端
- HTTP Action Gateway

默认动作入口为：

```bash
http://localhost:8765/actions
```

外部系统向该地址 `POST` 动作，前端会通过 HTTP 轮询取走并执行。

如需指定前端轮询地址：

```bash
VITE_OFFICE_HTTP_ACTIONS_URL=http://localhost:8765/actions npm run dev
```

如需单独启动动作网关：

```bash
npm run action-gateway
```

如需修改动作网关端口：

```bash
OFFICE_ACTION_GATEWAY_PORT=8766 npm run action-gateway
```

## HTTP 消息

新协议使用 `POST /scene/commands`，可以通过 `GET /scene/commands/:commandId` 查询结果，通过 `GET /scene/state` 和 `GET /scene/capabilities` 读取状态与能力。下面保留的 `/actions` 示例属于旧接口兼容入口；本地网关仅用于开发联调，不是生产业务服务。

单次工位拜访：

```bash
curl -X POST http://localhost:8765/actions \
  -H 'Content-Type: application/json' \
  -d '{"type":"desk_visit","visitor":1,"host":5,"message":"这件事交给你了。"}'
```

消息体示例：

```json
{
  "type": "desk_visit",
  "visitor": 1,
  "host": 5,
  "message": "这件事交给你了。"
}
```

连续拜访多个工位：

```json
{
  "type": "desk_visit_tour",
  "visitor": 1,
  "hosts": [2, 3, 4],
  "message": "请接手下一步。"
}
```

设置员工状态：

```json
{
  "type": "set_state",
  "rosterNo": 1,
  "state": "working",
  "task": "整理市场情报…"
}
```

## 联系我

如需交流或合作，可以扫码

<img src="./docs/wechat-qr.png" alt="微信二维码" width="220" />
