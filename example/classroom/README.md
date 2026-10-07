# 独立教育场景

一位教师、五位学生、独立课桌椅与可更新黑板。镜头沿用当前俯视角度，学生背对镜头、面向黑板。

## 运行与部署

在仓库根目录执行：

```sh
npm install
npm run dev:classroom -- --port 5176
npm run build:classroom
```

独立产物：`example/classroom/dist/`，只含教室代码、资源和通用包。生产构建会拒绝办公室包的导入。
完整官网也提供 `/classroom/` 入口：`npm run dev` / `npm run build`。官网部署包含多个演示的文件，但进入教室不请求办公室图片。

加载分两阶段：背景、桌椅与当前坐/站姿就绪后立即显示教室；其他方向、行走和起坐动作在后台加载，不用整屏遮罩等待。动作未齐时只禁用课堂执行按钮，黑板和课程可以先查看、编辑。动作下载失败后保留首屏，可单独重试；外部网关仍须等全部动作就绪才连接。

## 已有交互

- 讲课：教师就位、全体入座听课。
- 点名回答：教师提问、选中学生离座、前往黑板、面向同学回答、教师反馈、返回本人课桌。
- 连续演示：一次讲课和两位学生依次回答，使用运行时的真实依赖队列。
- 随时停止；安全结束当前步后，可使用返回座位按钮继续。
- 科学、数学、语文三个示例课程；黑板标题和内容可编辑。
- 点击人物或成员列表选择学生，发言字幕与课堂记录跟随执行状态。
- 教室右上角的“专注课堂”隐藏导航、侧栏与统计，让教室填满视口，只保留发言字幕、开始/停止和退出入口。优先进入浏览器全屏，不支持时使用页面内专注模式；按 Esc 或点击“退出专注”恢复原布局，切换不中断课堂活动、不重新加载场景。

专注模式为字幕和控制预留固定高度，发言出现、消失或换行不改变画布大小；超长字幕在字幕区内滚动。只在视口尺寸或像素密度实际变化时调整画布，并立即重绘，避免缩放跳动和空白帧。

课程台词是本地演示内容，不是模型生成。此版本没有自动判分、语音合成、持久化学籍或教师业务后台；举手、写字等新专属图片动作尚未制作。人物沿用项目现有完整帧，但独立导出所需动作，不包含敲键盘。学生服装目前是演示外观。

## 装配与驱动

```ts
import { mountScene } from '@pixoffice/renderer-pixi'
import { createClassroomAssembly } from './src/assembly'

const mounted = await mountScene(host, async signal =>
  createClassroomAssembly(new URL('/classroom-assets/', location.href).href, signal))
await mounted.view.prepareActions()

mounted.runtime.submit({
  protocolVersion: '2.0', sceneId: 'classroom', commandId: crypto.randomUUID(),
  type: 'activity.start', capability: 'classroom.answer',
  participants: [
    { entityId: 'teacher', role: 'teacher' },
    { entityId: 'student-1', role: 'student' },
  ],
  params: {
    boardId: 'blackboard', question: '我们生活在哪颗行星上？',
    answer: '我们生活在地球上。', feedback: '回答正确，谢谢你的分享。', durationMs: 4500,
  },
})

// 宿主负责调用；也可以选择下面的 HTTP 接入。
mounted.runtime.subscribe(() => { /* readActivePhases / snapshot */ })
// 页面销毁时
mounted.dispose()
```

`classroom.lecture`：一位 `teacher`，可选多位 `student`，参数 `text`、`durationMs`、`boardId`。
`classroom.settle`：一位 `teacher` 和需要回座位的 `student`，参数 `boardId`。
通过 `runtime.describe()` 获取完整参数 Schema；传输层可由宿主接 HTTP、iframe 或自己的业务事件，不能把不可信 JavaScript 当插件执行。

## 可选 HTTP 接入

默认不连接任何后台。使用公共协议 2.0 网关时，分别在两个终端执行：

```sh
PIXOFFICE_SCENE_ID=classroom OFFICE_ACTION_GATEWAY_PORT=8776 npm run action-gateway
VITE_CLASSROOM_GATEWAY_URL=http://127.0.0.1:8776 npm run dev:classroom -- --port 5176
```

访问教室并等待右上角显示连接后，将上面的命令 JSON `POST` 到 `http://127.0.0.1:8776/scene/commands`。
`GET /scene/state` 查看真实场景和执行记录，`GET /scene/capabilities` 读取能力。
不是旧办公室 `/actions` 接口。示例网关一次只接管一个页面，因此给教室使用独立端口，避免抢占正在运行的办公室。
动作资源准备好后才连接，关闭页面后停止轮询，断线保护复用公共客户端。开发网关只供本机调试；生产接入需要宿主自行提供鉴权和持久化。

`ClassroomApp` 也接受显式 `gatewayUrl` 属性。未配置时不启动网关、不轮询网络。

黑板更新使用公共协议：

```json
{
  "protocolVersion": "2.0", "sceneId": "classroom", "commandId": "board-001",
  "type": "object.state.set", "entityId": "blackboard", "expectedStateRevision": 0,
  "state": { "title": "分数与分享", "text": "一半 = 1/2" }
}
```

`expectedStateRevision` 必须读取当前物品版本，不能长期写死为 0。

## 包边界

```text
example/classroom
  ├─ scene-classroom       布局、教师/学生角色、课桌、黑板、教学阶段
  ├─ assets-classroom      必需帧动作、语义绑定、资源 ID
  ├─ animation-frame      当前播放器；以后在此注册骨骼适配器
  ├─ renderer-pixi         画布、缩放、标签、点击、动画宿主
  └─ runtime + contracts  行走、碰撞、排队、占用、取消与协议
```

素材来源与生成提示词见 `art/classroom/README.md`。每次构建生成带哈希的 `classroom-assets/asset-pack.json`；可以单独导出：

```sh
npm run assets:export:pack -- public/classroom-assets/asset-pack.json /tmp/classroom-export public/classroom-assets
```

新增教室专属动作只改教室素材绑定和场景表现；新增医院场景应另建平级场景/素材包，不修改或依赖本包。
