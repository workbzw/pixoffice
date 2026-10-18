# 测试与验收

测试用例、辅助工具、检查脚本和运行产物集中在本目录。所有命令均在项目根目录执行。

## 目录

```text
tests/
  *.test.mjs         Node 自动化回归：运行时、场景、协议、组件和资源
  helpers/           测试公共工具
  fixtures/          测试页面、消费端样例和固定输入
  checks/            包边界、发布包及在线服务检查脚本
  integration-e2e/   外部 HTTP 客户端、浏览器和 Docker 端到端验收
  artifacts/         自动生成的报告、截图、轨迹和日志，不提交或发布
```

`scripts/` 保留开发启动、正式构建、素材生成和文档录制工具；外部开发者使用的对接示例位于 [`integration/`](../integration/README.md)，不属于测试实现。

## 命令

| 命令 | 用途与前提 |
| --- | --- |
| `npm test` | 构建包、服务端及资源并执行全部 Node 回归 |
| `npm run lint` | 静态代码检查 |
| `npm run packages:check` | 检查包依赖边界、声明和导出，先运行 `npm run packages:build` |
| `npm run packages:smoke` | 在临时目录安装打包产物，验证 ESM、类型及独立场景；需要已构建包和本机 npm 缓存 |
| `npm run test:integration:types` | 检查端到端验收代码的 TypeScript 类型 |
| `npm run test:integration` | 构建临时 Docker 镜像并运行真实浏览器验收，需要 Docker 和浏览器环境 |
| `npm run test:service` | 检查已启动服务的页面、鉴权和 SSE 转发，不负责启动服务 |
| `npm run test:report` | 打开已有端到端 HTML 报告 |

只运行某个 Node 测试时，先确保包、服务端和资源已经构建，再执行：

```sh
node --test tests/officeDemo.test.mjs
```

只验证当前 `dist/` 的静态办公室，无需 Docker：

```sh
npm run build:full
PIXOFFICE_E2E_BROWSER_CHANNEL=chrome npx playwright test --config tests/integration-e2e/playwright.config.ts --grep "static local demo"
```

检查指定服务：

```sh
PIXOFFICE_URL=http://127.0.0.1:3000 PIXOFFICE_API_KEY=your-private-key npm run test:service
```

在线服务检查使用独立的测试团队，不向现有办公室下发动作。完整端到端验收使用隔离的容器、浏览器上下文和测试数据。

## 产物与覆盖范围

- `artifacts/integration-e2e-report/`：HTML 报告。
- `artifacts/test-results/`：JSON 结果、截图、浏览器轨迹、HTTP 记录和容器日志。
- 包安装冒烟测试使用系统临时目录，结束后自动清理。

`artifacts/` 已在 Git 与 Docker 中忽略。删除其中的报告不会影响应用运行，下次测试会重新生成。

测试不会代替生产环境的鉴权、代理超时和业务后端验收。详细场景、环境要求及观看浏览器操作的方法见[端到端验收说明](./integration-e2e/README.md)。
