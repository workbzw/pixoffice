export type WorkerId = 'wang' | 'zhou' | 'li' | 'chen' | 'liu'
export type TaskStatus = 'running' | 'blocked' | 'done'
export type Worker = {
  id: WorkerId; name: string; role: string; task: string; detail: string
  sprite: number; position: { x: number; y: number }; initialProgress: number; rate: number
}
export const workers: Worker[] = [
  { id: 'wang', name: '王明', role: '资料搜集', task: '搜集竞品资料', detail: '整理产品资料、定价和用户反馈', sprite: 0, position: { x: 1, y: 8 }, initialProgress: 68, rate: .34 },
  { id: 'zhou', name: '周理', role: '交叉校验', task: '核验数据准确性', detail: '发现 2 处统计口径不一致，等待确认', sprite: 3, position: { x: 8, y: 1 }, initialProgress: 46, rate: .32 },
  { id: 'li', name: '李研', role: '报告整理', task: '整理研究报告', detail: '汇总信息，梳理报告结构与结论', sprite: 1, position: { x: 6, y: 11 }, initialProgress: 58, rate: .28 },
  { id: 'chen', name: '陈书', role: '文档撰写', task: '撰写对比文档', detail: '从产品能力、体验与定价展开对比', sprite: 2, position: { x: 9, y: 8 }, initialProgress: 61, rate: .26 },
  { id: 'liu', name: '刘市', role: '图表分析', task: '分析关键数据', detail: '识别市场定位与核心功能差异', sprite: 4, position: { x: 12, y: 5 }, initialProgress: 74, rate: .30 },
]
export type Task = { workerId: WorkerId; progress: number; status: TaskStatus; note: string }
export type StudioSnapshot = {
  tasks: Task[]; running: boolean; elapsed: number; progress: number; completed: number
  robotTarget: WorkerId | null; log: { id: number; text: string; time: number }[]
}
export const initialSnapshot = (): StudioSnapshot => ({
  tasks: workers.map(w => ({ workerId: w.id, progress: w.initialProgress, status: w.id === 'zhou' ? 'blocked' : 'running', note: w.detail })),
  running: true, elapsed: 0, progress: 61, completed: 0, robotTarget: null,
  log: [{ id: 0, text: '竞品对比报告已启动，5 位成员参与协作', time: 0 }],
})
export const assetUrl = (name: string) => `${import.meta.env.BASE_URL}studio/${name}.webp`
export const statusLabel = (status: TaskStatus) => ({ running: '进行中', blocked: '待确认', done: '已完成' })[status]
export const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`
export function reportText(state: StudioSnapshot): string {
  return ['PixOffice · 竞品对比报告', '示例项目 / 本地演示数据', '', ...workers.map(w => {
    const task = state.tasks.find(t => t.workerId === w.id)!
    return `${w.name} · ${w.role}\n${w.task}：${statusLabel(task.status)} (${Math.floor(task.progress)}%)\n${task.note}`
  }), '', '关键观察', '1. 产品 A 偏重完整功能，产品 B 偏重上手体验。', '2. 定价口径需区分月付与年付。', '3. 用户量应统一到同一统计区间再比较。', '', '本文件由交互样板的本地演示数据生成，不代表真实调研结果。'].join('\n\n')
}
