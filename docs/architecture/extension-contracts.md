# PixOffice 扩展包与动画接口

本文描述已存在的包接口。接口以 [animation.ts](../../packages/contracts/src/animation.ts)、[ScenePack](../../packages/runtime/src/scenePack.ts) 和 [ScenePresentationPack](../../packages/renderer-pixi/src/ScenePresentationPack.ts) 为准。

## 场景开发入口

一个场景分成两个独立入口：

- `ScenePack`：清单、插件、初始世界、姿态能力检查，以及可选旧存档迁移。可在无 DOM/Pixi 的环境运行。
- `ScenePresentationPack`：背景、物品资源、视图注册、格到像素投影、运行时状态到人物表现描述。

场景清单当前为 `{ id, version, apiVersion: 1 }`，不是远程插件安装协议。模板、交互参数、物品状态沿用已有 `ScenePlugin` 和 Zod Schema。

```ts
import { createSceneRuntime } from '@pixoffice/runtime'
import { officeScenePack } from '@pixoffice/scene-office'

const runtime = createSceneRuntime(officeScenePack, { sceneId: 'office-1' })
```

未来增加教室时传入另一个真实实现的 ScenePack；不要在运行时加入 `if classroom`，也不要复制办公室运行时。

家具交互继续声明占地、入口、使用锚点、允许进入的格、朝向、姿态和资源。场景插件用这些定义组合活动阶段；物品视图只读取世界状态。教师讲解、答案评分等业务事实由外部系统负责，场景完成事件不代表答案正确。

## 动画接口

```ts
interface AnimationAdapter<TNode> {
  readonly id: string
  readonly apiVersion: 1
  readonly rendererApiVersion: 'pixi-1'
  acquire(manifest: VisualAssetManifest, signal: AbortSignal):
    Promise<VisualAssetLease<TNode>>
}

interface VisualAssetLease<TNode> {
  readonly manifest: VisualAssetManifest
  assess(request: VisualRequest): SupportResult
  prepare(requests: readonly VisualRequest[], signal: AbortSignal): Promise<void>
  create(initial: EntityPresentation): AnimatedVisual<TNode>
  release(): void
}

interface AnimatedVisual<TNode> {
  readonly root: TNode
  sample(state: EntityPresentation): readonly VisualCue[]
  getSocket(id: string): PointDu | undefined
  getHitBounds(): BoundsDu
  dispose(): void
}
```

实际接口包括全部依赖类型，可以直接导入，不需要另写一个抽象父类。当前 Pixi 宿主使用 `AnimationAdapter<Container>`。

- `acquire`：校验版本并取得一份素材资源引用；失败/取消必须清理本次取得的资源。
- `assess`：检查完整动作组合，不仅检查单独动作是否存在。
- `prepare`：准备指定组合的依赖，不创建角色或推进时间。
- `create`：创建独立播放实例，多个实例可以共享贴图。
- `sample`：使用宿主传入的时钟采样，不能更改世界位置、申请业务资源或发送业务完成回执。
- `release`：关闭资源租约；禁止继续创建/准备，但已有实例在自身销毁前仍有效。
- `dispose`：幂等销毁自己的节点和播放状态，不能销毁其他人物正在使用的共享贴图。

异步准备也占有资源引用，不能因为用户关闭预览就提前释放仍在解码的页面。当前帧适配器已有对应回归测试。

## 能力清单

`VisualAssetManifest` 含以下字段：

| 字段 | 含义 |
| --- | --- |
| schemaVersion | 当前为 1 |
| asset.id / revision | 资源身份和内容版本 |
| adapterId / adapterApiVersion | 选择播放实现及兼容版本 |
| rendererApiVersion | 当前为 pixi-1 |
| presentationProfileId | 人物比例和表现规格的标识 |
| capabilities.variants | 动作、姿态、视向、通道与可用时钟 |
| capabilities.combinations | 明确允许同时采样的变体列表 |
| capabilities.contactProfiles | 已制作并适配的接触规格 |
| capabilities.sockets | 真实可提供的挂点及稳定/动画策略 |
| source | 适配器自己的格式、URI 与扩展字段 |

`visualAssetManifestSchema` 校验版本、重复 ID、组合引用以及姿态/视向的一致性。具体资源格式由适配器进一步校验，不能只做 TypeScript 类型断言。

当前办公室语义包括 `core.idle`、`core.walk`、`core.sit-down`、`core.stand-up`、`core.speak`、`core.emote.*`、`office.type`。资源中的 `walk.back` 等 clip 名由办公室兼容映射处理，不进入核心运行时。

当前帧适配器允许一个完整身体动作，加最多一个语音层。不支持任意 gesture 混合。缺失身体动作、错误组合或未准备资源会报错，不用其他身体姿态冒充。

背面没有可见嘴时，办公室保留文字气泡、不强行播放口型。语音层是可选表现，不影响交互发言的逻辑状态。

## 坐标与时钟

地面坐标为整数格。表现根点为局部地面注册点 `(0, 0)`，x 向右、y 向下；`1 du` 对应人物站立参考高度。最终像素尺寸由场景的 `PresentedActor.displayHeight` 决定。

帧适配器保留原画布、pivot、referenceHeight 和所有图片偏移，再转换为 du。骨骼适配器需要把自己的轴向、单位和根骨骼映射到同一约定。

三种时钟：
- `time`：elapsedMs 与 loop，适用于工作、待命和嘴层。
- `progress`：0 到 1，适用于受运行时约束的坐起。
- `distance`：travelledDu 与 strideDu，适用于按地面距离同步走路。

宿主统一推进时钟，转向保留步态相位，动作改变重新计时。适配器不得私自启动 ticker、requestAnimationFrame 或定时器。骨骼 root motion 不能反向移动运行时实体。

`VisualCue` 预留动作标记返回值；当前帧播放器返回空数组，宿主尚不将 cue 用作业务完成依据。不能把骨骼动画结束事件当成任务成功。

## 挂点与接触

当前已提供：
- `root.ground`：地面根点。
- `ui.label`：由图片注册计算的姓名位置；循环动作保持稳定。

没有提供的手部、座位挂点应返回 undefined，不能用原点伪造。当前 `office-desk-v1` 是已有素材兼容声明，不是自动适配任意桌椅的能力。

接口允许传入 contacts；当前 FrameAdapter 对非空目标明确拒绝。骨骼适配器如提供 IK，需要自行声明真实能力、验证容差，并与家具接触规格一起验收。现有场景宿主不做通用 IK 求解。

## 应用装配

现有办公室等价于以下组合：

```ts
import type { Container } from 'pixi.js'
import { createSceneRuntime } from '@pixoffice/runtime'
import { SceneView, AnimationRegistry } from '@pixoffice/renderer-pixi'
import { FrameAdapter } from '@pixoffice/animation-frame'
import { officeScenePack } from '@pixoffice/scene-office'
import { createOfficePresentation } from '@pixoffice/scene-office/pixi'
// resolveOfficeAppearance 由应用提供，读取部署后的素材清单。

const runtime = createSceneRuntime(officeScenePack)
const scene = new SceneView({
  runtime,
  onStep: elapsedMs => runtime.tick(elapsedMs),
  dispatchCommand: command => runtime.submit(command),
  pack: createOfficePresentation(),
  animations: new AnimationRegistry<Container>().register(new FrameAdapter()),
  resolveAppearance: resolveOfficeAppearance,
})
// host、width、height 由调用页面提供：
// await scene.init(host, width, height)
// 页面退出时 scene.destroy(); runtime.dispose()
```

生产页面通过 `application/OfficeScene` 门面额外接回原来的演示、办公数据和 HTTP/iframe 桥接。新场景不需要继承办公室门面。

增加骨骼实现时，只在应用注册新适配器，并让对应外观描述的 adapterId 指向它。Registry 可以同时存在多个适配器；真实帧/骨骼混合尚未验证。

## 给骨骼开发者的交付要求

1. 实现 AnimationAdapter<Container>，交付引擎版本、许可说明和资源加载策略。
2. 交付一个人物及完整能力清单，映射根点、姓名位置、视向和单位。
3. 优先完成待命、四向行走、坐起、侧身说话和一个工作动作；缺失项明确标记。
4. 对照 FrameAdapter 的多实例、取消、重复释放与时钟测试。
5. 在同一办公室中只替换一个外观，验证人物大小、地面位置、标签、桌椅遮挡与动作中断。
6. 完成真实验证后再批量制作，不因接口存在就宣称无成本切换。

当前不支持运行中热换 appearance、不提供通用人物编辑器、不保证任意骨架适配任意家具。需要这些能力时单独设计版本和验收。
