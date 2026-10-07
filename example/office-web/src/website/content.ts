import type { WebsiteLocale } from './locale.ts'

const zh = {
  meta: {
    title: 'PixOffice · 可编程的二维办公室',
    description: 'PixOffice 是开源的二维办公室前端，让智能体的工作与协作变得看得见。支持人物互动、网格场景编辑、外部协议驱动与模块化扩展。',
    socialDescription: '让智能体的工作与协作变得看得见。体验完整办公室，或从最小装配开始构建。',
  },
  nav: {
    home: '首页', office: '完整办公室', minimal: '最小装配', classroom: '教室', docs: '文档',
    label: '官网导航', homeLabel: 'PixOffice 首页', returnHome: '返回 PixOffice 首页',
    openMenu: '打开导航菜单', closeMenu: '关闭导航菜单', language: '网站语言', skip: '跳至主要内容',
  },
  hero: {
    eyebrow: '开源 · 可编程的二维办公室',
    tagline: '让智能体的工作，变得看得见。',
    description: '把人物、空间与真实业务连接起来，让每一次协作都有迹可循。',
    primary: '进入办公室', secondary: '体验最小装配',
    alt: 'PixOffice 实际运行的二维办公室，六位成员、工位与协作白板',
    caption: '由你的系统驱动，由 PixOffice 呈现。', learn: '了解 PixOffice',
  },
  overview: {
    eyebrow: '看见协作发生', title: '一个有状态、有动作的工作空间。',
    description: 'PixOffice 是独立的可视化前端。\n你的系统负责业务，它负责把过程呈现出来。',
  },
  features: {
    collaboration: { title: '人物真的会协作', description: '走到同事身边、交谈、开会、回到工位。让工作状态成为具体的动作，而不只是一行日志。' },
    layout: { title: '空间可以自由编排', description: '基于整数网格布置家具与工位。寻路、碰撞和使用位置共同约束行为，场景不是静态背景。' },
    integration: { title: '连接你已有的系统', description: '通过协议驱动人物与物品，通过数据源连接任务和指标。无需绑定特定智能体或模型服务。' },
  },
  examples: {
    eyebrow: '三个入口，同一套核心', title: '先体验，再开始构建。',
    description: '体验办公室与教室，或从最小装配开始。\n选择适合你的起点。',
    office: { label: 'React 应用', alt: '完整办公室的任务看板、员工列表与协作场景', description: '任务看板、人物互动、聊天与布局编辑，体验完整的办公室界面。', action: '打开完整办公室' },
    classroom: { label: '独立教育场景', alt: '教室场景中的教师、五位学生、课桌与黑板', description: '教师讲课、学生起身回答、回到座位，体验独立场景包构建的课堂互动。', action: '进入教室' },
    minimal: { label: 'Vanilla TypeScript', alt: '最小装配中独立呈现的办公室场景', description: '只使用公开包接口拼装场景，不依赖 React，适合作为集成起点。', action: '打开最小装配' },
    note: '示例界面目前为中文，任务与指标为演示数据；真实业务和模型服务由你的系统接入。',
  },
  architecture: {
    eyebrow: '为扩展留下空间', title: '让变化，留在它该在的地方。', action: '阅读架构文档',
    note: '当前提供独立的办公室与教室场景，共用帧动画播放器；骨骼播放器可沿接口扩展，尚未内置。',
  },
  modules: {
    contracts: { title: '共同的语言', description: '命令、事件与资源契约' },
    runtime: { title: '行为的规则', description: '实体、寻路与资源预约' },
    'renderer-pixi': { title: '画面的呈现', description: '场景视图与渲染宿主' },
    'animation-frame': { title: '人物的动作', description: '帧动画播放与素材加载' },
    'scene-office': { title: '办公室的定义', description: '布局、家具与互动规则' },
  },
  developer: {
    eyebrow: '面向开发者', title: '你的业务逻辑。\n你的可视化办公室。',
    description: '从本地运行开始，再把已有系统的事件映射成人物动作。核心、场景和播放器可以分别演进。',
    action: '查看接入文档', docsNote: '接入文档目前以中文提供。',
  },
  code: {
    label: '代码示例', start: '本地启动', action: '发送动作', copy: '复制代码',
    success: '已复制', error: '复制未成功，请选中代码复制',
    gateway: '本地开发网关 · 旧版兼容动作接口', message: '一起核对这份数据。',
  },
  footer: {
    tagline: '让每一次协作，都有一个看得见的空间。', resources: '项目资源', license: '项目许可', notices: '第三方声明',
  },
}

const en: typeof zh = {
  meta: {
    title: 'PixOffice · A Programmable 2D Office',
    description: 'PixOffice is an open-source 2D office frontend that makes agent work and collaboration visible, with character interactions, grid-based editing, external protocols, and modular extensions.',
    socialDescription: 'Make agent work and collaboration visible. Explore the full office or build from the minimal example.',
  },
  nav: {
    home: 'Home', office: 'Full Office', minimal: 'Minimal Example', classroom: 'Classroom', docs: 'Docs',
    label: 'Main navigation', homeLabel: 'PixOffice home', returnHome: 'Back to PixOffice home',
    openMenu: 'Open navigation menu', closeMenu: 'Close navigation menu', language: 'Website language', skip: 'Skip to main content',
  },
  hero: {
    eyebrow: 'Open source · A programmable 2D office',
    tagline: 'See your agents at work.',
    description: 'Connect characters, spaces, and real workflows. Make collaboration visible.',
    primary: 'Enter the office', secondary: 'Try the minimal example',
    alt: 'A running PixOffice scene with six characters, workstations, and a shared whiteboard',
    caption: 'Driven by your system. Brought to life by PixOffice.', learn: 'Explore PixOffice',
  },
  overview: {
    eyebrow: 'Collaboration, in motion', title: 'A workspace with state and movement.',
    description: 'PixOffice is a standalone visualization frontend.\nYour system does the work. PixOffice shows the process.',
  },
  features: {
    collaboration: { title: 'Characters that collaborate', description: 'Walk over to a colleague, talk, meet, and return to a desk. Turn work states into visible actions, not just another line in a log.' },
    layout: { title: 'A space you can arrange', description: 'Place furniture and desks on an integer grid. Pathfinding, collisions, and interaction positions make the scene more than a static backdrop.' },
    integration: { title: 'Connect your own system', description: 'Drive characters and objects through a protocol. Connect tasks and metrics through data sources. No dependency on a specific agent or model provider.' },
  },
  examples: {
    eyebrow: 'Three entry points. One shared core.', title: 'Explore first. Then make it yours.',
    description: 'Explore the office and classroom, or start with the minimal example.\nChoose the starting point that fits your project.',
    office: { label: 'React application', alt: 'The full office interface with a task dashboard, employee list, and collaboration scene', description: 'Explore the full experience, with task dashboards, character interactions, chat, and layout editing.', action: 'Open the full office' },
    classroom: { label: 'Independent education scene', alt: 'A classroom with a teacher, five students, desks, and a blackboard', description: 'Watch the teacher explain a lesson and students stand up, answer, and return to their seats in an independent scene.', action: 'Enter the classroom' },
    minimal: { label: 'Vanilla TypeScript', alt: 'The standalone office scene in the minimal example', description: 'Assemble a scene using public package APIs. No React required. A small starting point for your integration.', action: 'Open the minimal example' },
    note: 'The examples currently use a Chinese interface and sample task data. Connect your own backend and model services for real workflows.',
  },
  architecture: {
    eyebrow: 'Room to grow', title: 'Keep change where it belongs.', action: 'Read the architecture docs',
    note: 'Independent office and classroom scenes share the frame player. Skeletal players can implement the extension interfaces; they are not built in yet.',
  },
  modules: {
    contracts: { title: 'A shared language', description: 'Commands, events, and asset contracts' },
    runtime: { title: 'Rules for behavior', description: 'Entities, pathfinding, and resource reservations' },
    'renderer-pixi': { title: 'The visual layer', description: 'Scene views and the rendering host' },
    'animation-frame': { title: 'Character motion', description: 'Frame playback and asset loading' },
    'scene-office': { title: 'The office itself', description: 'Layouts, furniture, and interaction rules' },
  },
  developer: {
    eyebrow: 'Built for developers', title: 'Your business logic.\nYour visual workspace.',
    description: 'Run it locally, then map events from your existing system to character actions. Evolve the core, scenes, and animation players independently.',
    action: 'Read the integration guide', docsNote: 'The integration docs are currently in Chinese.',
  },
  code: {
    label: 'Code examples', start: 'Run locally', action: 'Send an action', copy: 'Copy code',
    success: 'Copied', error: 'Copy failed. Select the code to copy it.',
    gateway: 'Local dev gateway · Legacy action endpoint', message: "Let's review this data together.",
  },
  footer: {
    tagline: 'A visible space for every collaboration.', resources: 'Project resources', license: 'Project license', notices: 'Third-party notices',
  },
}

export const websiteContent = { zh, en }
export const websiteRepository = 'https://github.com/workbzw/pixoffice'

export function websiteReadme(locale: WebsiteLocale = 'zh') {
  return `${websiteRepository}/blob/main/${locale === 'en' ? 'README.en.md' : 'README.md'}`
}

export function websiteSnippets(locale: WebsiteLocale) {
  const payload = { type: 'desk_visit', visitor: 1, host: 2, message: websiteContent[locale].code.message }
  // Quote JSON as a POSIX shell argument, including apostrophes in translated text.
  const jsonArgument = JSON.stringify(payload, null, 2).replaceAll("'", "'\\''")
  return {
    start: 'git clone https://github.com/workbzw/pixoffice.git\ncd pixoffice\nnpm install\nnpm run dev',
    action: [
      'curl -X POST http://localhost:8765/actions \\',
      "  -H 'Content-Type: application/json' \\",
      `  -d '${jsonArgument}'`,
    ].join('\n'),
  }
}
