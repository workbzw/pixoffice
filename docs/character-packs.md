# 人物资源包

## 实现范围

六个现有人物已迁移到 `art/characters/packs/`。每个人独立维护单帧 PNG 与 `character.json`，构建时自动打包为多页图集。运行时不再分析透明区猜切片、不依赖六个人在旧图集中的排列，也不按每一帧的包围盒重新缩放。

视觉资源管线与寻路、碰撞、座位坐标、多人协作和场景协议保持独立。走路、坐起与默认工作动作使用完整图片帧；旧手臂约束试验仅保留兼容。制作尺寸见[人物尺寸标准](./character-art-standard.md)，新增与修改的强制流程见[人物素材准入](./character-admission.md)。

## 目录

```text
art/characters/packs/marvis/
  character.json
  standard.json
  quality.json                     # 新增/修改正式素材必需
  review.json                      # 绑定素材版本的视觉验收
  idle/back/001.png
  walk/back/001.png ... 004.png
  run/back/001.png ... 004.png
  sit/back/001.png
  pose/lean/001.png
  pose/rise/001.png
  talk/seated-right/001.png
  work/typing-back-v2/001.png ... 004.png
  work/computer-v1/body.png
  work/computer-v1/upper.png
  work/computer-v1/forearm.png
  work/computer-v1/hand.png
  emote/wave/001.png

public/characters/                 # 自动生成，不提交 Git
  registry.json
  marvis/
    manifest-<内容版本>.json
    atlas-0-<内容哈希>.png
    atlas-1-<内容哈希>.png
```

源素材是维护入口；不要直接编辑生成的图集、注册表或 manifest。图片布局改变后，业务仍通过 `walk.back` 等名称访问动作。

## 制作规范

- 正式办公室资源包统一使用 256 x 384 的透明画布，锚点为 (128, 344)，参考身高 280，场景显示身高 84。底层格式支持其他尺寸，但不等于通过当前办公室准入。
- 同一人物的所有动作使用同一参考比例。坐下自然变矮，鞋底位置随姿态变化；地面锚点不变。禁止把坐姿单独放大到站姿高度。
- 帧四周至少保留一圈透明像素。构建脚本按 alpha 自动裁切，并记录偏移，运行时恢复原始逻辑画布。
- 左右镜像必须通过显式 alias 配置；不能默认翻转非对称人物。
- 图片中不包含桌椅、阴影、对白或名字。碰撞体和工位归属属于场景配置，不属于人物 PNG。
- 原始混合图集已通过一次性迁移脚本归一化。这个校准只在导入时发生，运行时不再按姿态重复计算比例。
- 六人的坐姿、前倾、起身、坐着转头及正背面行走以各自站姿头部可见面积校准，额外检查宽高，而不是分别凑到预设身体高度。`scripts/characters/register-office-motion.mjs` 和 `art/characters/office-motion-v2/` 保存原图与标注，可复现本版校准；日常构建不重新处理原图。

## 配置示例

下面是 `character.json` 的字段示意，省略了其他必需方向与动作，不能直接作为完整资源包构建。完整可用例子见 `art/characters/packs/marvis/character.json`。

```json
{
  "schemaVersion": 1,
  "id": "new-resident",
  "label": "新人物外观",
  "profile": "office",
  "canvas": { "width": 256, "height": 384 },
  "pivot": { "x": 128, "y": 344 },
  "referenceHeight": 280,
  "displayHeight": 84,
  "portrait": "idle.front",
  "clips": {
    "walk.back": {
      "loop": true,
      "frames": [
        { "file": "walk/back/001.png", "durationMs": 250 },
        { "file": "walk/back/002.png", "durationMs": 250 }
      ]
    },
    "walk.left": { "alias": "walk.right", "mirrorX": true }
  }
}
```

每帧可以有不同的播放时长。多个动作可以引用同一张源图片，例如入座与起身倒序复用坐姿、前倾、半起身和站姿，不必复制文件。

## 必需动作与降级

六人默认使用完整 `work.quiet-back` 图片帧动画。王明保留已验收的生成帧；其他五人各自生成完整办公姿态及左右按键帧，导入时只裁切、等比缩放和配准整个人物，不拼接手臂、不复用王明的手部。播放顺序和时长读取王明配置：按键阶段重复 3 秒，随后静止 1 秒。六个工位使用同一套新桌椅。人物预览可选择任一员工查看“坐姿与轻微办公”。制作记录见 [王明办公坐姿 v2](../art/characters/marvis-quiet-work-v2/README.md) 和 [五人整图工作帧 v4](../art/characters/office-quiet-work-v4/README.md)。

`basic` 要求 `idle` 和 `walk` 的 front/back/left/right 四方向，以及有效的 portrait 动作。

`office` 额外要求 `sit.back`、`stand-up.back` 和 `sit-down.back`。入座/起身的单次动作使用 `loop: false`。

可选动作包括 `run.back`、`emote.wave`、`emote.thinking`、`emote.surprised`、`talk.seated-right`、`talk.seated-left`。缺少跑步时可降级到同方向行走；缺少表情可显示正面站姿；缺少坐姿不能伪装为坐姿，办公室资源包会在校验阶段被拒绝。没有转头帧时保留真实坐姿。

`work.computer-back` 是保留在素材与预览中的旧桌面适配动作：输入、移到鼠标、操作鼠标、停手查看屏幕、返回键盘，共 12 秒；不再作为办公室的默认 `working` 动作。旧的 `bake-quiet-work.mjs` 拼接方案已停用发布；当前使用 `register-generated-work.mjs` 导入完整生成图片。

可选 `work` 配置声明两侧肩部、三个部件的动作引用及起止锚点、预览接触面。`part.work-*` 是内部贴图，不出现在动作列表。桌椅视图的 `getWorkSurface()` 返回世界渲染坐标，经 `AgentEntity` 转为人物局部坐标，再按资源包统一倍率换算到素材坐标。家具绘制与接触点共用 `workstationSurface.ts` 的变换参数。它不参与地面整数格、碰撞和协议命令。

只有坐好、背向桌面且处于 `working` 时启用轻微办公。侧身交谈、行走和入座/起身优先，立刻切离工作帧。六人默认工作动画播放完整图片，不依赖运行时工作面；保留旧 `work.computer-back` 供预览和未提供完整工作帧的旧资源包使用。

旧 `work.typing-back` 四帧动作仍保留在预览和素材中，没有 `work` 配置的旧资源包仍可使用它；没有两种工作动作的包保持普通坐姿。原有工具和素材记录见 [桌面适配电脑办公](../art/characters/office-computer-work-v1/README.md)。完整帧直接进入人物图集，没有新增渲染循环或运行时图片加工。

`office.focus` 活动完成返回工位、入座后，展示层将其映射为持续 `working`，直到活动结束；重复刷新状态不重置打字计时器。外部通过 `actor.presentation.set` 设置的 `working` 同样持续播放，直到状态改变。活动的临时展示不覆盖外部任务标题、状态或版本，结束专注后恢复外部展示。

说话使用可选的 `speak.front`、`speak.right`、`speak.left`、`speak.seated-right`、`speak.seated-left` 循环动作。现有六个人都已提供，只有存在非空对白且身体处于站立/坐姿时播放；聆听、对白结束、取消后恢复原姿态。走路、入座/起身和显式表情优先。背面看不到嘴巴或资源包没提供口型时保持原动作，不强制转身。此版本没有语音合成，也不是音频驱动的逐音素口型同步。

现有口型素材与制作记录见 `art/characters/speech-mouths/README.md`。新增人物可以直接提供完整说话帧，无需依赖这份六人素材制作脚本。

### 可选独立嘴部

现有六人均使用“无嘴身体帧 + 独立嘴部 Sprite”。正面/侧面站立、室内行走、坐着转头已拆分；背面不显示嘴，原有表情和历史行走暂保留原画。原图不覆盖，新底图位于各人物包的 `body/`，口型位于 `mouth/`。生成来源及导入脚本见 `art/characters/marvis-mouth-layer/README.md` 与 `art/characters/mouth-layers/README.md`。

资源包可增加可选 `mouth`：`pivot` 定义口型贴图在统一画布中的中心，`views` 按视角指向闭嘴与说话动作。身体动作每帧可增加 `mouth: { x, y, view, scale, rotation }`，挂点基于未裁切人物画布，旋转单位为度。没有挂点的帧隐藏独立嘴部；不根据人物 ID 在播放器里硬编码坐标。

闭嘴保持同一口型随挂点移动；发言仅切换嘴部贴图，身体帧和身体计时器不变。嘴部跟随左右镜像、逐帧头部位移、缩放和旋转。入座、起身、行走及明确的表情优先于发言，避免移动途中因旧对白而张嘴。`speak.*` 在现有六人包中仅是身体动作别名，预览使用独立口型的 730ms 时间轴，不再复制整张人物图。

`sampleCharacterLayers` 是办公室 Pixi 和 React 人物预览/头像共用的采样入口。嘴部贴图使用同一资源包和图集缓存，每人最多增加一个 Sprite，没有额外计时器、每帧图片加工或单独图片请求。原本没有 `mouth` 配置的资源包兼容原有显示方式。

采样器返回当前帧、镜像标记、是否降级及 `completed`。普通动作按时间播放；办公室行走按实际移动距离推进，转向保留步相，遇阻不会原地踏步。预览的走路仍按资源配置的时间播放。入座/起身由场景进度定位到对应帧，等待或暂停不会继续走动。动画完成不等于业务任务完成，任务推进仍由场景内核决定。

## 新增与修改

1. 在 `.character-staging/<版本>/<id>/` 准备完整候选，不直接写入正式库。保存三视图母版、原图和真实配准记录。
2. 使用 `characters:draft` 创建质量规则，补齐后执行 `characters:audit`。
3. 使用 `characters:preview` 在隔离场景检查逐帧、连续播放、走停、坐起、交谈、工作与桌面接触；使用 `characters:review` 填写真实视觉验收。
4. 使用 `characters:publish` 发布通过检查的版本，正式目录自动发现并登记；旧包有备份，失败会回滚。
5. 需要把这个外观放入办公室时，在场景 actor 配置中将 `templateId` 指向资源包 ID。actor 的 `id`、姓名、岗位、工位保持独立；多个人也可以使用同一套外观。

现有场景仍由场景配置决定有几个人、使用哪些工位。新增资源包不会自动新增员工或占用工位，也未新增可视化人员编制编辑器。

修改单个动作也要走同一套验收流程；原验收不能覆盖改动后的图片或配置。启动开发、生产构建、测试前自动检查准入并打包。六个现有人物仅按原内容指纹冻结兼容，非视觉合格认证。开发服务器不会监听素材自动重打包。

## 校验与发布

```bash
npm run characters:build
npm run characters:check
npm test
npm run build
```

构建校验：配置版本、必需动作、文件存在性、统一画布、透明留边、空帧、越界、路径穿越、别名缺失或循环、播放时长、重复 ID；新增和修改的正式包还必须通过动作质量规则和版本绑定的视觉验收。运行时再次校验 manifest 与实际贴图尺寸。预览的“已加载”只说明资源可读取，不表示美术合格。

图集最长边默认 2048，禁用旋转，自动分页并保留像素间距。由 Sharp 裁切/合成，MaxRects Packer 负责矩形排布，均仅作为构建依赖，不进入前端包。

- Sharp 官方文档：https://sharp.pixelplumbing.com/api-composite/
- MaxRects Packer 项目：https://github.com/soimy/maxrects-packer

输出文件带内容版本；文件先写入，注册表最后原子替换。失败构建不会破坏旧注册表。旧的内容版本暂不自动删除，以免开发中仍打开的页面请求不到贴图。生产发布使用新的 dist 目录。

`characters:check` 不修改文件，会在生成资源缺失或过期时失败。生成资源已被 Git 忽略；CI/新电脑应先安装依赖，再运行构建或测试。工具使用 Node.js 的原生 TypeScript 加载能力，要求 Node.js 22.18+ 或 24+。

## 加载与释放

场景只请求实际出现人物的资源包。预览根据注册表列出人物，仅在靠近可见区域时加载；离屏和页面隐藏时停止预览计时器。

相同人物的并发加载合并为一次。场景、头像和预览各持有引用；只有全部释放且闲置 30 秒后，才卸载贴图。重新加载会等待尚未完成的卸载，避免关闭预览导致办公室白屏。

## 旧资源

`public/assets/characters/apartment/` 保留旧素材与生成提示词，作为来源记录和一次性导入输入，不再由正常帧动画播放器加载。`?characters=classic` 仍保留原 Spine 对照，不属于新人物包管线。

迁移脚本 `scripts/characters/import-apartment.mjs` 只用于最初迁移，现在直接写库入口已停用，不应在日常修改素材后重跑。其他历史 README 中的直接发布命令也以新准入流程为准。
