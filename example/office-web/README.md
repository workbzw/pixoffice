# 完整办公室

原有 React 应用迁移至这里，业务数据、聊天、地图编辑器、演示和外部驱动均保留。

从仓库根目录执行 `npm install && npm run dev`。生产构建仍为 `npm run build`，输出根目录 `dist/`，原 Vercel 构建入口保持不变。

同一站点提供三个独立入口：`/` 为项目官网，`/office/` 为完整办公室，`/minimal/` 为最小装配。官网导航链接到两个示例，示例均可返回官网。`src/website/` 是轻量介绍页，不加载场景运行时或人物图集；`src/main.tsx` 仍负责完整办公室装配。

官网支持中文、英文切换，文案集中在 `src/website/content.ts`。语言优先级为 URL 的 `?lang=zh|en`、本地保存的选择、浏览器语言；未匹配时使用中文。右上角切换会更新当前 URL 并记住选择。两个示例内部及现有文档仍为中文。

官网的 GitHub 入口随语言打开仓库中的 `README.md`（中文，仓库默认）或 `README.en.md`（英文）。两份 README 提供相互切换链接，返回官网时也保留对应语言。

主要装配位于 `src/application/OfficeScene.ts` 与 `createOfficeRuntime.ts`。所有核心能力通过 `@pixoffice/*` 包的公开 exports 导入；`src/scene` 等少量转发文件服务于既有 UI 和测试，不是另一套核心实现。

修改包代码后执行 `npm run packages:build`，或另开终端运行 `npm run packages:watch`。不要通过 Vite alias 绕过发布产物。
