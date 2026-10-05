# 完整办公室

原有 React 应用迁移至这里，业务数据、聊天、地图编辑器、演示和外部驱动均保留。

从仓库根目录执行 `npm install && npm run dev`。生产构建仍为 `npm run build`，输出根目录 `dist/`，原 Vercel 构建入口保持不变。

主要装配位于 `src/application/OfficeScene.ts` 与 `createOfficeRuntime.ts`。所有核心能力通过 `@pixoffice/*` 包的公开 exports 导入；`src/scene` 等少量转发文件服务于既有 UI 和测试，不是另一套核心实现。

修改包代码后执行 `npm run packages:build`，或另开终端运行 `npm run packages:watch`。不要通过 Vite alias 绕过发布产物。
