# PixOffice 包架构

原则：**把变化限制在局部。** 通用执行规则留在中心，场景、素材、动画技术和业务页面在边缘分别演进。

当前已拆为十个 npm workspace 包，办公室、教室与农场通过 `example/` 分别装配。包可构建和 `npm pack`，尚未发布 npm；真实骨骼播放器未实现。

首次拆包见 [拆包验收记录](./package-migration.md)；当前增补见 [场景隔离与按需装配](./scene-isolation.md)。

## 目录与责任

```text
packages/
  contracts/          动画、能力、表现与接触规格的类型和 Schema
  runtime/            状态、协议、寻路、占用、活动、取消、地图事务
  renderer-pixi/      Pixi 画布、人物/物品视图、标签、点击和动画宿主
  animation-frame/    完整图片帧播放、图集加载与共享资源租约
  assets-office/      办公室帧素材标准、动作绑定与旧预览兼容
  scene-office/       办公室布局、家具、交互、投影与物品视图
  assets-classroom/   教室动作要求、语义绑定与独立资源 ID
  scene-classroom/    课桌、黑板、教学流程与独立场景表现
  assets-farm/        农作动作语义绑定与独立帧资源
  scene-farm/         菜地、作物状态、农作流程与独立场景表现
example/
  office-web/         原有完整 React 页面、聊天、业务数据、编辑器、外部接入
  minimal-vanilla/    不使用 React 的办公室装配与拜访命令
  isolated-scene/     不依赖办公室的独立运行、独立资源与构建示例
  classroom/          独立教室应用、素材构建与部署
  farm/               独立农场应用、模拟时钟、自动照料与存档
assets/office/        办公室构建配置与旧路径转发，不是业务执行代码
art/characters/      原始动作素材、准入记录
public/               供宿主部署的资源；生成图集不提交 Git
scripts/              包构建、素材构建、安装验证与开发工具
tests/                行为、资源、协议、依赖边界和包消费者测试
```

## 依赖方向

箭头表示“依赖”，不是事件方向：

```text
example/office-web、example/minimal-vanilla
    ├── scene-office
    │     ├── runtime
    │     ├── contracts
    │     └── renderer-pixi（仅 /pixi 表现入口使用）
    ├── renderer-pixi ──→ runtime、contracts
    ├── animation-frame ──→ contracts
    ├── assets-office/frame ──→ animation-frame、contracts
    └── runtime

未来 animation-skeleton ──→ contracts + 所选骨骼引擎 + Pixi peer
scene-classroom         ──→ runtime、contracts、renderer-pixi
assets-classroom        ──→ animation-frame、contracts
scene-farm              ──→ runtime、contracts、renderer-pixi
assets-farm             ──→ animation-frame、contracts
```

- `runtime` 不依赖 React、Pixi、办公室或动画播放器。协议和场景插件接口目前由它导出，没有再拆成多个微型包。
- 办公室、教室与农场不互相引用。场景只发送语义动作，替换帧/骨骼素材不改变业务规则。
- `scene-office` 的根入口与 `/core` 无 DOM/Pixi 执行依赖；`/pixi` 才加载画面实现。安装层仍是同一个包，所以宿主需要满足声明的依赖。
- `scene-office` 与 `renderer-pixi` 不依赖 `animation-frame`。素材解析和注册适配器由应用装配。
- `contracts` 不依赖任何 PixOffice 实现包，避免形成大而全的公共工具库。
- Pixi 是视觉相关包的 peer dependency，由宿主提供同一版本，避免多个引擎实例和纹理缓存。
- 所有包只通过显式 `exports` 公开 API；生产示例读取编译后的包，不通过 alias 绕回源码。

## 三个扩展接口

| 扩展点 | 所在包 | 新开发者实现什么 |
| --- | --- | --- |
| `ScenePack` / `ScenePlugin` | runtime | 世界、模板、能力、活动阶段和校验 |
| `ScenePresentationPack` / `PropViewRegistry` | renderer-pixi | 投影、物品画面和状态到语义动作的映射 |
| `AnimationAdapter<Container>` | contracts | 资源加载、实例、动作采样、挂点、释放 |

`SceneView` 接收只读 `SceneReadPort`。应用决定如何推进 runtime，通过 `onStep` 注入时钟，通过 `dispatchCommand` 注入编辑命令。销毁视图不销毁应用提供的 runtime；宿主负责两者生命周期，不能同时启用两套推进时钟。

详细契约见 [扩展接口](./extension-contracts.md)，可运行装配见 [最小示例](../../example/minimal-vanilla/src/main.ts)。

也可使用 `mountScene`，传入延迟加载的 `SceneAssembly`；此入口统一拥有运行时、视图、缩放和取消清理。最小办公室与独立场景使用同一装配接口。

## 素材交付

素材不混入 npm 代码包。`npm run assets:build` 生成图集及 `characters/visuals/*.json` 中立能力清单；清单的 `source.uri` 相对清单 URL，由宿主解析。

生成的 `public/asset-packs/` 提供家具、每个人物和完整办公室的独立版本清单。`assets:export:pack` 按清单导出并校验哈希，`characters:build -- --ids ... --out ...` 可只制作指定人物。通用播放器不要求办公动作，专属规则由 `assets-office/frame` 提供。

外部项目使用 `npm run assets:export -- /absolute/path/to/new-public-directory` 导出资源、版本摘要和许可证。目标必须不存在，防止覆盖已有目录。宿主可以部署在根路径、子路径或 CDN；跨域资源需要对应 CORS 配置。

完整示例沿用注册表以支持既有预览工具，最小示例直接读取生成的 VisualAssetManifest。两者使用同一份帧绑定定义，没有复制动作参数。

## 开发和验证

```sh
npm install
npm run dev                           # 包、素材预构建；完整页面 + 本地 HTTP 网关
npm run packages:watch                # 修改包时重建，另开终端运行
npm run dev -w @pixoffice/example-minimal-vanilla -- --port 5174
npm run packages:build
npm run packages:check                # 依赖方向、显式入口、产物
npm run packages:smoke                # 打 tgz，在临时目录真实安装、执行并检查类型
npm run dev:isolated                  # 无办公室依赖的独立场景
npm run build:isolated                # 只构建独立示例自己的资源与代码
npm test
npm run lint
npm run build
```

最小示例需要先执行 `npm run packages:build && npm run assets:build`。包构建按依赖顺序进行。开发时 Vite 使用 dist，不伪装成可发布源码包。

## 可以如何分工

| 工作 | 主要修改范围 | 验收 |
| --- | --- | --- |
| 核心维护 | runtime | 无 UI 运行、协议、导航、占用、取消和恢复 |
| 渲染维护 | renderer-pixi | 只读投影、点击、清晰度、生命周期 |
| 帧播放器维护 | animation-frame | 帧采样、共享纹理、取消、资源释放 |
| 骨骼开发 | 新 animation-skeleton 包 | 同一接口、一个真实人物、与帧人物并存 |
| 场景开发 | scene-office 或新 scene-classroom | core 与 pixi 入口、布局与交互验证 |
| 应用集成 | example/office-web | 页面、聊天、业务 API 和状态展示 |
| 素材制作 | art、assets | 尺寸、注册点、动作、能力清单与视觉验收 |
| 办公室素材集成 | assets-office | 办公动作要求、绑定、专属资源解析与预览兼容 |

分工不要求一个人一个包。公共契约修改需先讨论，修改边缘实现不应要求其他成员同步改代码。

## 兼容范围与限制

外部命令仍为 `2.0`，存档版本、ID、地面整数格、旧动作入口、图像内容及动作时序保持。原 `src/` 已迁移，依赖仓库内部路径的消费者需要改用包入口；示例保留少量转发文件供旧页面和素材测试使用，不是第二套内核。

当前验证办公室、独立行走示例和帧实现；测试替身不等于真实骨骼支持。不支持运行中世界热替换/外观热换、远程安装任意插件、自动 IK 或任意家具接触适配。缺少动作能力应明确拒绝，不能换一个姿态冒充。

包版本暂统一 `0.1.0`；内部依赖使用精确版本。正式发布前需要确定 npm scope 权限、版本策略、真实骨骼兼容矩阵与发布流程。本次不会执行 publish。

农场使用宿主注入的模拟时钟，生长不依赖动画帧数。`Capability.complete` 返回纯状态提案；运行时验证资源声明、状态版本和 Schema，先持久化整个结果再发布，避免取消、重复命令或保存失败造成重复收获。`Phase.actions` 声明语义动作，不从任务标题猜测动画。
