# 场景隔离与按需装配

## 本轮边界

通用四包不认识具体场景；办公室、教室与农场分别由两个可选包组成：

| 层 | 包 | 依赖方向 |
| --- | --- | --- |
| 公共契约 | contracts | 无 PixOffice 实现依赖 |
| 核心运行时 | runtime | 无场景、渲染或播放器依赖 |
| 渲染宿主 | renderer-pixi | runtime、contracts |
| 帧播放器 | animation-frame | contracts |
| 办公室行为与视图 | scene-office | runtime、contracts、renderer-pixi |
| 办公室帧素材规则 | assets-office/frame | animation-frame、contracts |
| 教室行为与视图 | scene-classroom | runtime、contracts、renderer-pixi |
| 教室帧素材绑定 | assets-classroom | animation-frame、contracts |
| 农场行为与视图 | scene-farm | runtime、contracts、renderer-pixi |
| 农场帧素材绑定 | assets-farm | animation-frame、contracts |

`animation-frame` 不再要求办公室坐姿、四向走路或敲键盘。它验证图片、图集、
锚点、别名与播放时序；具体场景决定必需动作。办公室原规则保留在
`assets-office/frame/packSchema`，不会因为通用化而放松素材验收。

原 `animation-frame/workAnimation` 已迁至 `assets-office/frame/workAnimation`。
这些包尚未发布 npm，应用和仓库工具已同步更新。原始图片、动作参数、命令 2.0 和存档未改。

## 如何增加新场景

1. 新增与 `scene-office` 平级的 `scene-classroom`，实现 `ScenePack` 和 `ScenePresentationPack`。
2. 使用独立素材目录、构建配置和部署目录；需要专属素材规则时再新增 `assets-classroom`。
3. 在应用的装配模块选择场景、播放器和素材 URL，禁止新场景反向导入办公室。
4. 注册可信模块的动态 import；用户只选择预注册场景，不通过命令执行任意远程 JavaScript。
5. 检查动作能力后才开放交互。缺少动作必须报错，不能用其他姿态冒充。

办公室与教室共享内核，但不互相依赖。教室现已实现，见 [独立教室示例](../../example/classroom/README.md)。骨骼播放器尚未实现。
以后骨骼适配器仍实现 `AnimationAdapter<Container>`，由素材能力清单选择；
场景发出语义动作，不直接调用具体骨骼或帧编号。

## 统一装配入口

```ts
import { mountScene } from '@pixoffice/renderer-pixi'

const abort = new AbortController()
const mounted = await mountScene(element, async signal => {
  const module = await import('./selected-scene/assembly')
  return module.createAssembly(signal)
}, { signal: abort.signal })

// 关闭或切换场景时
mounted.dispose()
abort.abort()
```

`SceneAssembly` 只有四项：`scene`、`pack`（表现包）、`animations`、`resolveAppearance`。
`mountScene` 负责创建运行时、初始化视图、唯一时钟、容器缩放和释放；加载失败或取消也会清理。
装配函数本身不应提前占用纹理或创建独立时钟。`createAppearanceResolver` 只请求指定 ID，
解析相对资源 URL，合并重复请求，失败允许重试。

完整 React 办公室保留带编辑器扩展的 `OfficeScene` 装配；最小办公室和独立示例使用
同一个 `mountScene`。切换采用销毁旧实例再创建新实例，不是正在执行中的世界热替换。

## 素材按需交付

```sh
# 完整官网演示所需素材
npm run assets:build

# 只构建选定人物，必须使用独立输出目录
npm run characters:build -- --ids marvis,code-agent --out /tmp/my-character-packs

# 仅导出家具或一个人物；目标目录必须不存在
npm run assets:export:pack -- public/asset-packs/office-furniture.json /tmp/office-furniture
npm run assets:export:pack -- public/asset-packs/marvis.json /tmp/marvis-assets

# 兼容的完整办公室导出
npm run assets:export -- /tmp/office-assets
```

目录清单版本为 1，含 ID、整体 revision、文件路径与 SHA-256、入口文件。
导出只复制清单中当前版本的文件，不再复制所有历史图集和 PNG 源文件；导出前校验
哈希、相对路径和真实路径，拒绝越界符号链接及覆盖已有目录。
人物目录清单的 appearance 入口就是 VisualAssetManifest；无需下载其他人物注册表。

通用制作引擎为 `scripts/assets/build-character.mjs`，场景配置显式传入解析器、
首屏动作、依赖采样及可选准入策略。办公配置在 `assets/office/build-profile.mjs`。
`--ids` 仍保留选定人物的全部办公动作，不代表逐动作裁剪；独立示例演示了制作阶段的动作筛选。

**按需加载、按需打包和部署体积不同。** 根目录官网包含完整办公室，因此仍部署办公室资源；
教育专用应用应使用自己的 publicDir、依赖和 Vite 入口，不能复制根 public 后宣称完全隔离。

## 验收入口

- `example/isolated-scene`：无办公室依赖，一个人物只含站立/行走与嘴部资源，独立 dist。
- `example/classroom`：独立教室资源和入口，生产打包禁止导入办公室包。
- `example/farm`：独立农场资源和入口，生产打包禁止导入办公室或教室包。
- `packages:check`：十个包的导入方向和公开入口检查。
- `packages:smoke`：仓库外安装并验证各代码包与通用四包。
- `tests/classroom.test.mjs`：五位学生往返、碰撞、串行排队、各阶段取消、角色与外观解耦。
- `tests/farm.test.mjs`：种植闭环、并发照料、碰撞、取消、状态版本、持久化失败和重放幂等。
- `tests/sceneIsolation.test.mjs`：自定义动作、选择性制作、清单导出安全、移动取消和按需解析。
- 原办公室测试及 `characters:check`：确认人物资源与既有行为不变。

限制：未新增骨骼实现；教室专属举手、写字动作尚未制作，现有完整帧用于演示教学交互。官网使用页面导航切换场景，不迁移执行中的跨场景活动。
现有办公室图片加载器仍有单次配置约束，不承诺同页多套不同 CDN 的办公室实例热切换。
