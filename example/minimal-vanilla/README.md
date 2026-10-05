# 最小办公室装配

不依赖 React，只使用五个包的公开入口和部署后的素材 JSON。

仓库根目录：

```sh
npm run packages:build
npm run assets:build
npm run dev -w @pixoffice/example-minimal-vanilla -- --port 5174
```

`src/main.ts` 展示 runtime、场景、动画适配器、素材解析、视图和命令的完整连接。选择两位同事后可发起真实工位拜访，结束后自动回座位。

外部项目安装五个包后，将导出的素材放入自己的 public 目录，复制此示例即可。仓库配置使用共享 `../../public`，外部项目请改为自己的 publicDir。代码不引用仓库源码别名。

骨骼开发时在动画注册表增加自己的适配器，让一个人物的 VisualAssetManifest 指向它，其余人物继续使用帧适配器。先验证一个真实人物；不要因接口可编译就视为视觉验收完成。
