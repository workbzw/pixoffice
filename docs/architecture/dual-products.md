# 双产品架构

目标：**共享规则，不共享风格假设。** 新轴测风格不是旧办公室的显示开关，两者拥有各自的场景、素材、入口、构建产物和存档空间。

```text
protocol: 2.0 命令 / 实体数据 / 地面坐标 / 可选业务协议
   ↑                         ↑
runtime                    contracts
实体、寻路、行为阶段        动画 / 投影 / 表现 / 产品契约
资源占用、取消、存档          ↑
   └────────── renderer-pixi ┘
                    ↑
       ┌────────────┴────────────┐
  现有风格装配                 轴测风格装配
  正交坐标映射                 2:1 菱形投影
  现有 scene-* / assets-*      独立场景 / 独立素材
  animation-frame             标准 AnimationAdapter
  旧页面与旧存档               独立入口与存档
```

图中向上箭头表示依赖。`renderer-pixi` 是共同的画布宿主，不引用任何具体场景或播放器。投影算法在表现边界，不进入寻路和碰撞算法。

## 本轮已完成

| 边界 | 代码入口 | 责任 |
| --- | --- | --- |
| 对接协议 | `@pixoffice/protocol` | 从 runtime 提取现有命令、实体 Schema、地图协议，后端可单独依赖 |
| 运行时 | `@pixoffice/runtime` | 保留一套实体、路径、阶段、占用和取消机制，不识别产品风格 |
| 投影 | `SceneProjection` | 地面到屏幕、反投影、格子轮廓、场景范围、深度、方向映射 |
| 渲染配置 | `SceneRenderProfile` | 画布抗锯齿、CSS 像素缩放、像素对齐、背景，由产品声明 |
| 动画 | `AnimationAdapter` / `PresentedActor` | 8 个可声明视图，支持地面行程驱动步频，与帧/骨骼实现无关 |
| 产品装配 | `SceneAssembly.product` | 产品 ID、表现规格、存档命名空间；检查素材规格是否匹配 |
| 存档 | `browserPersistence` 第三个参数 | 产品显式指定命名空间；默认使用当前 PixOffice key，不读取旧 key |
| 独立构建 | `example/dimetric` | 可运行验证场，不加载现有三场景素材，构建时检查边界 |

## 三套坐标各司其职

1. **地面格坐标**：实体、家具占地、交互点、寻路目标仍为整数格。连续行程仅用于移动插值，不改变格子规则。
2. **投影坐标**：`SceneProjection` 将地面位置映射为画布局部位置。`SceneView.screenToCell()` 先消除画布缩放/平移，再反投影取格。
3. **素材局部坐标**：脚底、挂点、接触面与动作资源由素材清单和适配器负责，禁止拿画面中的像素距离判断业务是否到位。

`createDimetricProjection(64)` 使用 `screenX=(x-y)*32`、`screenY=(x+y)*16`，得到 64 × 32 的 2:1 菱形。它不是三个轴等长的严格等距投影。世界 north/east/south/west 映射为 back-right/front-right/front-left/back-left；旧 front/back/left/right 通过显式转换兼容，未改旧存档字段。

## 场景和素材如何开发

场景开发者提供 `ScenePack` 和 `ScenePresentationPack`，不修改共享内核来增加某种风格。场景规则声明地面占地、交互入口、姿态和阶段；表现代码负责家具分层、人物位置和接触校准。复杂前后遮挡仍需合理拆分家具前后层，投影接口不能自动解决所有遮挡。

素材开发者声明动作、姿态、视图、挂点和 `presentationProfileId`。帧和骨骼都实现同一个 `AnimationAdapter<Container>`。缺少斜向素材不能默默拿正面图代替。`assertProductAppearance` 会拒绝错用其他表现规格的素材，但无法代替人工检查美术风格、比例和接触关系。

像素素材的纹理最近邻过滤由素材加载器/动画适配器设置；`rendering.pixelArt` 只控制画布的 CSS 缩放，不会更改旧纹理的共享缓存。当前验证入口使用程序化标记，尚未接入像素纹理。

宿主在 `SceneAssembly` 中选择投影、资源解析器和播放器。当前轴测例子的场景与诊断标记保留在示例内部；正式美术和规则稳定后再提为独立 `scene-dimetric-*` / `assets-dimetric-*` 包。不要复制 runtime，不要在旧 `scene-office` 中加入轴测分支。

## 兼容策略

- 现有办公室、教室、农场仍使用原投影、素材和动作参数；本地存档改用当前 PixOffice 命名空间，不再读取旧存档 key。
- 未声明投影的旧场景自动使用 `createOrthogonalProjection(cellPixels)`。
- 命令与业务数据统一从 `@pixoffice/protocol` 对应入口导入；旧 runtime 协议转发文件和旧页面契约路径已删除。
- 现有播放器仍按原节奏采样；只有显式提供 `locomotion` 的新产品才按地面行程采样。
- `product.storageNamespace` 是装配声明；宿主需显式传给 `browserPersistence`。不会自动迁移或删除旧数据。
- 产品切换采用不同页面/部署入口，不支持运行中替换世界或不兼容素材。

## 验收与分工

核心维护者负责 protocol/runtime 兼容与无 UI 测试；渲染维护者负责投影、命中、缩放、深度与生命周期；各产品团队独立交付场景规则、素材和装配。新增动作时先扩展具体素材与场景能力，不要向中心增加具体办公或教学动作名称。

回归包括旧场景测试、2:1 投影正反变换、方向映射、缩放后选格、存档隔离、错用素材拒绝、投影无关步频、入座/离座/取消，以及两套独立构建。`tests/productBoundaries.test.mjs` 与 `tests/architecture.test.mjs` 固化这些边界。

本轮不包含最终像素美术、骨骼引擎、任意旋转镜头、多楼层、轴测拖放编辑器或新的统一网络信封。HTTP/IPC、鉴权、连接管理和业务路由仍由宿主承担；现有命令协议继续为 2.0。
