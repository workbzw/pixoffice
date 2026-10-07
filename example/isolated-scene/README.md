# 独立场景验收示例

一个人物、两个目标点，支持移动与取消。不是教室，也不是完整产品页面。
仅依赖 `contracts`、`runtime`、`renderer-pixi`、`animation-frame` 和宿主 Pixi。
不安装、不导入 `scene-office` 或 `assets-office`。

```sh
# 从仓库根目录运行
npm run dev:isolated -- --port 5175
npm run build:isolated
```

`dev:isolated` 默认由 Vite 选择端口。需要明确指定时：

```sh
npm run packages:build
npm run dev -w @pixoffice/example-isolated-scene -- --port 5175
```

构建输出在本示例的 `dist/`，可单独部署；不使用根目录 `public/`。
`src/main.ts` 通过动态 import 加载 `src/assembly.ts`，使用通用 `mountScene` 管理生命周期。
`src/world.ts` 定义场景，不包含办公室岗位、桌椅或活动。

为避免重复存储原图，`build-assets.mjs` 在制作阶段复用现有王明源图片，
只选取站立、行走及其嘴部依赖，生成独立的 `walker` 资源。
最终资源没有办公室工作、入座等动作，不需要办公室注册表。
这验证了代码与交付产物隔离，不代表示例提供了一套新美术。

未来场景将自己的源素材、构建脚本和 public 目录替换进来即可。
