import type { WebsiteLocale } from './locale.ts'

const zh = {
  meta: {
    title: 'PixOffice · 场景',
    description: '探索 PixOffice 的办公室、教室、农场与公务场景，让智能体的工作与协作变得看得见。支持场景定制与外部系统接入。',
    socialDescription: '选择一个场景，看看协作如何发生。办公室、教室、农场与公务场景，以及场景定制。',
  },
  nav: {
    home: '场景', office: '完整办公室', minimal: '最小装配', classroom: '教室', farm: '农场', civic: '公务', docs: '文档',
    label: '官网导航', homeLabel: 'PixOffice 首页', returnHome: '返回 PixOffice 首页',
    openMenu: '打开导航菜单', closeMenu: '关闭导航菜单', language: '网站语言', skip: '跳至主要内容',
  },
  examples: {
    title: 'PixOffice 场景',
    description: '选择一个场景，看看协作如何发生。',
    office: { label: '团队协作', alt: '完整办公室的任务看板、员工列表与协作场景', description: '任务看板、人物互动与多会话聊天。', action: '打开完整办公室' },
    classroom: { label: '教育互动', alt: '教室场景中的教师、五位学生、课桌与黑板', description: '教师授课、学生回答与课堂互动。', action: '进入教室' },
    minimal: { label: '轻量装配', alt: '最小装配中独立呈现的办公室场景', description: '不含外围界面的独立办公室，适合作为集成起点。', action: '打开最小装配' },
    farm: { label: '种植日常', alt: '农场中的菜地、农夫与生长中的蔬菜', description: '多人协作，完成播种、照料与收获。', action: '进入农场' },
    civic: { label: '公务场景预览', alt: '公务场景中的六位制服成员、成员侧栏与便民服务保障白板', description: '便民服务保障、现场协同与回访归档。人物动作仍在验收中。', action: '进入公务场景' },
    note: '示例界面目前为中文，任务与指标为演示数据；真实业务和模型服务由你的系统接入。',
  },
  contact: {
    label: '专属场景', title: '场景定制', description: '扫码联系作者，聊聊你的场景与人物需求。',
    action: '联系作者', enlarge: '放大联系作者二维码', qrAlt: '场景定制联系作者的微信二维码',
    dialogTitle: '场景定制 · 联系作者', close: '关闭联系窗口', channel: '微信扫码联系作者',
  },
  developer: {
    eyebrow: '面向开发者', title: '你的业务逻辑。\n你的可视化办公室。',
    description: '从本地运行开始，再把已有系统的事件映射成人物动作。核心、场景和播放器可以分别演进。',
    action: '查看接入文档', docsNote: '接入文档目前以中文提供。',
  },
  code: {
    label: '代码示例', start: '本地启动', action: '发送动作', copy: '复制代码',
    success: '已复制', error: '复制未成功，请选中代码复制',
    gateway: 'Fastify · 场景消息转发', message: '一起核对这份数据。',
  },
  footer: {
    tagline: '让每一次协作，都有一个看得见的空间。', resources: '项目资源', license: '项目许可', notices: '第三方声明',
  },
}

const en: typeof zh = {
  meta: {
    title: 'PixOffice · Scenes',
    description: 'Explore office, classroom, farm and public service scenes in PixOffice. Make agent collaboration visible, with custom scenes and external integrations.',
    socialDescription: 'Choose a scene and see collaboration in motion. Explore office, classroom, farm and public service scenes, or request a custom scene.',
  },
  nav: {
    home: 'Scenes', office: 'Full Office', minimal: 'Minimal Example', classroom: 'Classroom', farm: 'Farm', civic: 'Public Service', docs: 'Docs',
    label: 'Main navigation', homeLabel: 'PixOffice home', returnHome: 'Back to PixOffice home',
    openMenu: 'Open navigation menu', closeMenu: 'Close navigation menu', language: 'Website language', skip: 'Skip to main content',
  },
  examples: {
    title: 'PixOffice Scenes',
    description: 'Choose a scene and see collaboration in motion.',
    office: { label: 'Team collaboration', alt: 'The full office interface with a task dashboard, employee list, and collaboration scene', description: 'Tasks, character interactions and multi-session chat.', action: 'Open the full office' },
    classroom: { label: 'Learning together', alt: 'A classroom with a teacher, five students, desks, and a blackboard', description: 'Lessons, student answers and classroom interactions.', action: 'Enter the classroom' },
    minimal: { label: 'Lightweight setup', alt: 'The standalone office scene in the minimal example', description: 'A standalone office without the surrounding interface. A starting point for integration.', action: 'Open the minimal example' },
    farm: { label: 'Life on the farm', alt: 'Farmers tending vegetable beds at different growth stages', description: 'Work together to plant, tend and harvest.', action: 'Enter the farm' },
    civic: { label: 'Public service preview', alt: 'Six uniformed members, the member sidebar and a community service board', description: 'Community service planning, on-site coordination and follow-up. Character animation review is in progress.', action: 'Enter public service' },
    note: 'The examples currently use a Chinese interface and sample task data. Connect your own backend and model services for real workflows.',
  },
  contact: {
    label: 'Made for you', title: 'Custom Scenes', description: 'Scan to contact the author about your scene and character needs.',
    action: 'Contact the author', enlarge: 'Enlarge the contact QR code', qrAlt: 'WeChat QR code for custom scene inquiries',
    dialogTitle: 'Custom Scenes · Contact', close: 'Close contact window', channel: 'Scan with WeChat to contact the author',
  },
  developer: {
    eyebrow: 'Built for developers', title: 'Your business logic.\nYour visual workspace.',
    description: 'Run it locally, then map events from your existing system to character actions. Evolve the core, scenes, and animation players independently.',
    action: 'Read the integration guide', docsNote: 'The integration docs are currently in Chinese.',
  },
  code: {
    label: 'Code examples', start: 'Run locally', action: 'Send an action', copy: 'Copy code',
    success: 'Copied', error: 'Copy failed. Select the code to copy it.',
    gateway: 'Fastify · Scene message relay', message: "Let's review this data together.",
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
  const payload = {
    protocolVersion: '2.0', sceneId: 'office-1', commandId: 'visit-example-1',
    type: 'activity.start', capability: 'office.visit',
    participants: [{ entityId: 'office-lead', role: 'visitor' }, { entityId: 'code-agent', role: 'host' }],
    params: { stops: [{ hostId: 'code-agent', message: websiteContent[locale].code.message }] },
  }
  // Quote JSON as a POSIX shell argument, including apostrophes in translated text.
  const jsonArgument = JSON.stringify({ teamId: payload.sceneId, command: payload }, null, 2).replaceAll("'", "'\\''")
  return {
    start: 'git clone https://github.com/workbzw/pixoffice.git\ncd pixoffice\nnpm install\nnpm run dev',
    action: [
      'curl -X POST http://localhost:8765/api/pixoffice/messages \\',
      "  -H 'Authorization: Bearer pixoffice-demo-key' \\",
      "  -H 'Content-Type: application/json' \\",
      `  -d '${jsonArgument}'`,
    ].join('\n'),
  }
}
