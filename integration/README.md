# 外部系统对接

本目录集中存放外部业务后端接入 PixOffice 所需的协议说明和可运行客户端。前端应用位于 `example/`，服务端实现位于 `server/`，公共 Schema 位于 `packages/protocol/`。

## 目录

```text
integration/
  README.md
  clients/
    client.mjs                 初始化、任务更新和用户确认示例
    ui-client.mjs              领取用户操作并返回展示结果
  docs/
    office-integration.md      HTTP 接入协议与完整流程图
    dashboard-integration.md   业务快照和白板字段
    chat-integration.md        可选聊天流式接口
    message-relay.md           部署、连接配置和职责边界
```

## 阅读顺序

1. [HTTP 接入协议与流程图](./docs/office-integration.md)：了解初始化、数据更新、用户操作、决策菜单和动画指令。
2. [业务快照字段](./docs/dashboard-integration.md)：准备办公室、成员、任务和固定格式白板数据。
3. [部署与连接配置](./docs/message-relay.md)：启动 PixOffice、设置服务地址和密钥。
4. [聊天流式接口](./docs/chat-integration.md)：需要接入聊天生成服务时阅读。

## 运行示例

在项目根目录安装依赖并启动服务器模式：

```sh
npm install
npm run dev
```

打开启动日志中 Vite 地址的 `/office/` 页面。在另一个终端初始化办公室、更新任务并等待用户确认：

```sh
npm run integration-example
```

办公室初始化后，可在另一个终端启动用户操作处理示例，然后在页面点击人物或任务按钮：

```sh
npm run integration-ui-example
```

这两个客户端模拟外部业务后端，不是 PixOffice 服务端。默认服务地址为 `http://127.0.0.1:8765`，默认密钥为公开演示值 `pixoffice-demo-key`。连接其他服务时，通过进程环境变量配置：

```sh
PIXOFFICE_URL=http://127.0.0.1:3000 PIXOFFICE_API_KEY=your-private-key npm run integration-example
```

纯静态演示 `npm run dev:vite` 不接收外部业务请求。公网部署应配置私有密钥及页面访问控制。

## 实现与验收

- [公共协议 Schema](../packages/protocol/src/office-integration.ts)
- [PixOffice 服务端实现](../server/src/)
- [场景运行时 SDK 与命令协议](../docs/plugin-runtime.md)
- [测试与验收入口](../tests/README.md)
- [端到端验收说明](../tests/integration-e2e/README.md)

示例客户端仅通过公开 HTTP 协议对接，不导入前端内部代码，也不承担业务系统的持久化或业务权限管理。
