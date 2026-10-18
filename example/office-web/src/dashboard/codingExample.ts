import type { ExampleOfficeSeed } from './demoSource.ts'

/** A local programming example; no tasks are sent to a real agent. */
export const codingOfficeExample: ExampleOfficeSeed = {
  workspace: { id: 'office-1', name: '登录模块开发' },
  roles: { 'office-lead': '项目负责人', 'code-agent': '技术方案', 'file-agent': '后端开发',
    'app-agent': '前端开发', 'review-agent': '自动化测试', 'data-agent': '代码审查' },
  tasks: [
    { id: 'login-plan', title: '需求拆解', assigneeId: 'code-agent', status: 'completed', progress: 100,
      summary: '确定邮箱密码登录、退出登录与登录态保持的验收标准。' },
    { id: 'login-api', title: '登录接口', assigneeId: 'file-agent', status: 'running', progress: 72,
      summary: '实现登录、退出和用户信息接口，统一鉴权与错误返回。' },
    { id: 'login-page', title: '登录页面', assigneeId: 'app-agent', status: 'running', progress: 60,
      summary: '实现登录表单、输入校验、加载状态和错误提示。' },
    { id: 'login-integration', title: '联调测试', assigneeId: 'review-agent', status: 'blocked', progress: 20,
      summary: '测试用例已准备，等待登录接口与页面完成后进行联调。' },
    { id: 'login-review', title: '安全审查', assigneeId: 'data-agent', status: 'queued', progress: 0,
      summary: '检查权限边界、敏感信息泄露和过期登录态处理。' },
  ],
}
