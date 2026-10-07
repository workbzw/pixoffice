# 最小办公室装配

不依赖 React，只使用六个包的公开入口和部署后的素材 JSON。

官网 `/` 与完整办公室 `/office/` 都提供「最小装配」入口，在同一站点的 `/minimal/` 打开；顶部可返回官网或完整办公室。根目录执行 `npm run build` 时会同时构建这三个页面，可一起部署，无需额外服务。

若要单独运行最小示例：

仓库根目录：

```sh
npm run packages:build
npm run assets:build
npm run dev -w @pixoffice/example-minimal-vanilla -- --port 5174
```

`src/main.ts` 通过通用 `mountScene` 动态加载 `src/assembly.ts`，连接场景、播放器、素材和命令。选择两位同事后可发起真实工位拜访，结束后自动回座位。

外部项目安装六个包后，将导出的素材放入自己的 public 目录，复制此示例即可。仓库配置使用共享 `../../public`，外部项目请改为自己的 publicDir。代码不引用仓库源码别名。完全不依赖办公室的装配见相邻 `isolated-scene` 示例。

骨骼开发时在动画注册表增加自己的适配器，让一个人物的 VisualAssetManifest 指向它，其余人物继续使用帧适配器。先验证一个真实人物；不要因接口可编译就视为视觉验收完成。
