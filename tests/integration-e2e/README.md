# 外部对接端到端验收

本套测试模拟外部业务后端，仅通过公开的 `POST /api/pixoffice/messages` 发送协议文档中的 JSON。Playwright 打开真实浏览器，由页面自行建立 SSE、更新场景、提交用户操作和业务结果。测试客户端与生产源码及内部 Schema 独立。

## 运行

需要项目支持的 Node.js、可用的 Docker，以及访问 npm、浏览器下载源和容器镜像仓库的网络。先在项目根目录安装依赖，然后执行：

```sh
npm ci
npm run test:integration
```

该命令检查测试代码类型、安装 Chromium、构建当前源码的生产镜像，随后运行 21 个验收用例。16 个对接用例使用独立容器、随机端口和随机密钥；5 个本地演示用例使用独立静态文件服务。所有用例均使用隔离的浏览器上下文。测试结束自动删除临时容器及本次构建的镜像标签。

本机已有 Chrome 时，可以使用隔离的无界面 Chrome：

```sh
PIXOFFICE_E2E_BROWSER_CHANNEL=chrome npm run test:integration
```

使用项目支持的 Node 22 镜像构建：

```sh
PIXOFFICE_E2E_NODE_IMAGE=node:22-bookworm PIXOFFICE_E2E_BROWSER_CHANNEL=chrome npm run test:integration
```

观看真实浏览器操作，在命令末尾添加 `-- --headed`；逐步调试使用 `-- --debug`。测试使用 2 倍像素密度，并校验画布实际像素尺寸，避免在高分屏上用低分辨率画布观看。

选择菜单用例会保留约 3 秒，让底部绿色倒计时明显缩短，再提交选项；超时用例会等待倒计时结束，确认菜单自动关闭且没有默认同意。

Linux CI 需要先安装浏览器系统依赖，例如运行 `npx playwright install --with-deps chromium`。CI 运行同一条测试命令，非零退出码表示验收失败。

## 覆盖

| 内容 | 验证结果 |
| --- | --- |
| 多办公室初始化和切换 | 目录、任务和白板隔离，场景不是空白画布 |
| 任务从进行中到完成 | 接口结果、页面进度、白板内容及刷新恢复一致 |
| 白板展示进度 | 时间推进不会修改后端数据，只有完成状态显示 100%，新任务重新开始 |
| 点击场景人物和详情按钮 | 后端领取正确操作，返回内容在真实对话框展示 |
| 任务按钮与白板展示 | 用户操作到后端，后端返回新快照并更新白板 |
| 确认、拒绝、多选项、超时 | 底部绿色倒计时持续缩短，原请求返回正确结果，到期关闭且无默认审批 |
| 静态站点本地演示 | 不连接业务后端，选择和确认菜单均有 60 秒倒计时，到期关闭，重新演示重新计时 |
| 侧边待决定卡片 | 电脑和手机共用问题截止时间，可直接选择或确认，队列推进不保留上一题选项，到期消失 |
| 非当前办公室的菜单 | 无需切换即可提交，原请求收到所属团队的结果，记录仍在对应办公室 |
| 人物动画 | 公开查询中的人物位置变化，画布像素同时变化 |
| 网络断开、刷新、新页面 | 恢复最新状态 |
| 服务重启 | 清除旧目录，重新初始化后接受新状态 |
| 多页面、并发、乱序、重复、冲突 | 最新版本保留，正常重复回报无错误提示 |
| 错误密钥、无效操作、null | 返回正确错误响应 |
| 移动端 | 场景非空白，用户可以实际选择菜单 |

测试不会模拟浏览器内部 SSE 或调用内部回报接口。场景画布的点击使用固定办公室布局下的相对位置，布局变化时需更新对应交互点。

完整验收会从待测镜像提取静态发布文件，在独立静态服务中使用原始空连接配置，模拟 Vercel 静态部署，不拦截或替换页面的业务数据。提取的临时文件会在测试结束后清理；针对已有镜像复测时也使用该镜像里的静态文件。

只验证本机 `dist/` 的静态演示时不需要 Docker：

```sh
npm run build:full
PIXOFFICE_E2E_BROWSER_CHANNEL=chrome npx playwright test --config tests/integration-e2e/playwright.config.ts --grep "static local demo"
```

## 报告

- `integration-e2e-report/index.html`：HTML 验收报告。
- `test-results/integration-e2e-results.json`：机器可读结果。
- `test-results/integration-e2e/`：各用例的外部请求与响应 JSONL，失败截图、浏览器执行轨迹和容器日志。

请求日志不记录鉴权头。测试业务数据由本套测试生成。结果目录已加入 Git 和 Docker 构建忽略规则。

```sh
npx playwright show-report integration-e2e-report
```

## 针对已有镜像复测

设置 `PIXOFFICE_E2E_IMAGE` 可直接验收指定镜像，此模式跳过当前源码构建，并保留该镜像。用于定位问题或复测特定发布产物：

```sh
PIXOFFICE_E2E_IMAGE=pixoffice:your-release PIXOFFICE_E2E_BROWSER_CHANNEL=chrome npm run test:integration -- --grep "server restart"
```

测试类型检查可独立运行：

```sh
npm run test:integration:types
```
