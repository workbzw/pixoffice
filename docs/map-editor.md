# 房间布置与地图协议

人通过全屏房间布置界面编辑，AI / 外部程序通过 `map.edit` 命令编辑，两者进入同一个 `MapDraft`。旧版左右图层 / 属性面板已移除。场景渲染器只展示草稿，不拥有正式地图数据。

## 使用

点击办公室左上角的网格图标。进入编辑前会关闭后续演示调度；正在执行的活动需要先结束，人物完成入座 / 出座后才能创建草稿。进入后：

- 全屏房间：点击家具并拖动，自动吸附地面网格；人物随自己的桌椅移动。
- 底部家具目录：使用场景同一渲染器生成的真实缩略图。选择家具，在画布点击落下；Escape 取消待放家具。
- 「房间内」页签：定位已有家具。选中后可改名、交换工位所属人物、复制、收起。
- 顶部：撤销 / 重做、完成布置、退出；有修改时退出需确认放弃。
- 高级菜单：JSON 导入 / 导出、静态路线测试；坐标和锚点不再常驻界面。
- 不提供单独禁行区绘制按钮。日常阻挡来自物品的地面碰撞体；旧地图的地面边界和禁行数据仍兼容，不会被静默删除。

地图、家具、人物、路径和外部协议统一使用**整数格**：`unit: "cell"`、`gridSize: 1`。人物占 1×1 格，办公桌椅整组占 2×2 格，白板占 2×1 格。家具位置是占地原点的格索引，原点为全局 (0,0)，不接受半格或小数坐标。

模板用整数 `footprint` 声明底部占地，不按整张贴图的包围框计算。整个占地禁止普通行走；只有家具声明的互动才允许人物进入其 `interactions.cells`。入口格是家具外的正常地面，使用格可以在家具内部。机制详见[整数格与家具互动](./integer-grid-and-interactions.md)。

拖动预览只做轻量几何检查；松手后执行完整通道校验，不合法则回原位，不新增撤销记录。底图中的柜子、绿植仍是背景的一部分，不在本版可移动家具目录中。现有素材只有固定朝向，暂不展示旋转按钮。

一次成功拖动只生成一次修改记录。快捷键 `Cmd/Ctrl+Z` 撤销，`Cmd/Ctrl+Shift+Z` 重做；输入框保持原生文本编辑行为。Escape 放弃当前拖动或未完成的路线选点。

人物绑定到工位后会随桌椅移动；选择已占用工位上的另一位人物会交换两人的工位。删除有绑定人物的工位前需解除绑定或用一次原子命令重绑。解除绑定后人物必须处于合法地面。

## 安全边界

- 正式地图不随草稿变化，只有校验成功的 `commit` 才会应用并持久化。
- 原存档的桌椅位置、人物身份、业务展示状态、白板内容和命令记录不因进入编辑而重置。
- 人工摆放命令使用 `requireValid: true`，几何错误和通道不可达都会原子拒绝，不改变历史。外部批量规划和导入默认仍允许几何错误保留为草稿；结构错误（不存在的模板、重复 ID、丢失人物绑定）始终整批拒绝。
- 校验包含物品整格占地、地面凸多边形、禁行区域、家具局部交互通道、必需交互点的可达性、人物绑定唯一性。
- 座位 / 入座通道与当前桌椅素材绑定，禁止单独修改这些锚点；可以修改拜访、交谈、白板会议等交互锚点。
- 草稿历史最多 50 步，只保存在内存中。刷新前需应用或导出草稿；取消 / 刷新不会覆盖正式地图。
- 路线预览是静态地图预检，不包含临时人物避让；活动执行仍由现有 MovementController 处理人物避让与重新寻路。

## AI / HTTP 接入

开发网关默认 `http://127.0.0.1:8765`，以实际启动端口为准。

读取 `GET /scene/state`：`world` 是正式地图和运行状态，`map` 是可导出的地图文档，`editor` 是当前草稿（可能不存在）。读取 `GET /scene/capabilities` 获得 JSON Schema、当前模板、碰撞体、锚点和命令能力。

`furnitureGrid.cellSize` 和 `world.gridSize` 都固定为 1，使用同一个格。所有位置、占地边界、锚点偏移和路径点都必须是整数；显示像素不进入协议。

所有编辑通过 `POST /scene/commands`，结果通过 `GET /scene/commands/:commandId` 查询。HTTP 202 只代表网关接收；必须等命令 `completed`，再读取已更新的 `editor.revision`。浏览器需保持打开并连接本地网关。

### 1. 创建草稿

```json
{
  "protocolVersion": "2.0",
  "sceneId": "office-1",
  "commandId": "map-begin-001",
  "type": "map.edit",
  "edit": {
    "action": "begin",
    "expectedLayoutRevision": 16
  }
}
```

`expectedLayoutRevision` 使用刚读取的 `world.layoutRevision`，不是固定填写 16。如果已有草稿，应读取并继续使用，不能覆盖它。

### 2. 原子修改

```json
{
  "protocolVersion": "2.0",
  "sceneId": "office-1",
  "commandId": "map-patch-001",
  "type": "map.edit",
  "edit": {
    "action": "patch",
    "requireValid": true,
    "draftId": "draft-实际ID",
    "expectedDraftRevision": 0,
    "operations": [
      {
        "op": "prop.put",
        "prop": {
          "id": "extra-desk",
          "name": "备用工位",
          "templateId": "office.workstation",
          "position": { "x": 14, "y": 7 }
        }
      }
    ]
  }
}
```

`draftId` 和 `expectedDraftRevision` 必须来自最新的 `editor.id` / `editor.revision`。人、AI 或撤销操作改变地图后旧版本会报 `DRAFT_CONFLICT`；读取新草稿，重新判断修改，再用新 commandId 提交。不要盲目覆盖。

支持的操作：

| 操作 | 数据 |
| --- | --- |
| `prop.put` | 完整物品 `{id,name,templateId,position,anchors?}`；新增或更新 |
| `prop.remove` | 物品 `id` |
| `floor.set` | `points`，3–16 个顺序排列的凸多边形顶点 |
| `blocked.put` | `{area:{id,name,bounds}}`，新增或更新矩形禁行区 |
| `blocked.remove` | 禁行区 `id` |
| `binding.set` | `actorId`、`homeId`（可为 null）、可选 `position` |
| `map.replace` | 完整 `document`，用于导入 |

`prop.put` 不修改业务 state。锚点坐标相对物品原点，人物未绑定工位时的 position 是场景绝对坐标。修改多人绑定时，把所有变更放在同一个 operations 数组中。

### 3. 预检与应用

以下 edit 对象也都需要 `draftId` 和最新 `expectedDraftRevision`：

```json
{ "action": "route", "from": { "x": 8, "y": 6 }, "to": { "x": 10, "y": 9 } }
```

- `validate`：结果位于 `editor.validation`。
- `route`：结果位于 `editor.route`，包括路径点、距离、转弯次数或明确错误。
- `undo` / `redo`：修改文档并增加草稿版本；版本不会因撤销倒退。
- `commit`：重新校验、保存、替换正式地图、增加 layoutRevision、关闭草稿。
- `cancel`：关闭草稿，正式地图不变。

校验和路线预览不会改变文档版本。所有命令仍遵守已有的 commandId 去重规则。断网不会把编辑草稿自动应用，AI 可重连后读取当前状态。

## 地图格式与范围

导出格式为 `ai-office-map` / `version: 2` / `unit: "cell"`，只包含场景布局，不包含任务、API Key、对话、业务状态或可执行脚本。只允许当前场景、相同画布尺寸与固定背景摆放范围，并且只能引用本应用注册的可信模板。UI 导入最大 64 KB，物品最多 200，禁行区最多 64。

v1 地图 JSON 不直接导入，避免把旧连续单位误当成格数；浏览器 v1 存档由专用迁移器先备份再转换。\n\n本版支持凸多边形地面、矩形禁行区、已有桌椅 / 白板素材。暂不包含凹多边形地面、多楼层、任意背景上传、家具自由旋转、人物素材编辑和多人网络协作。无需新增编辑器服务或引入另一套寻路算法。

## 模块归属

```text
React 家具目录 / 选中浮层 / SVG 指针交互层
             | map.edit（与 HTTP / iframe 相同）
OfficeRuntime -> MapDraft -> MapDocument / 原子操作
             |      |
             |      +-- NavigationAdapter：草稿校验 / 路线预览
             +--------- 正式 World / 存档 / layout.changed
                            |
                       Pixi OfficeScene
```

`src/runtime/map/` 不依赖 React、Pixi 或浏览器存储；`components/map-editor/` 只负责交互；`OfficeScene` 只投影草稿及短暂拖动预览。可继续沿现有模板、能力插件、导航适配器扩展物品与行为。
