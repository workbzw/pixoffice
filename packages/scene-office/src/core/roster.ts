export type AgentRosterEntry = {
  id: string
  name: string
  color: number
  task: string
}

/** 6 位市场部员工（名册序号 1–6） */
export const OFFICE_ROSTER: AgentRosterEntry[] = [
  {
    id: 'marvis',
    name: '王明',
    color: 0xe85d4a,
    task: '主管：等待交付物',
  },
  {
    id: 'code-agent',
    name: '李研',
    color: 0x4a90d9,
    task: '检索：扫描信息源',
  },
  {
    id: 'file-agent',
    name: '周理',
    color: 0x9b6dd7,
    task: '整理：归类情报',
  },
  {
    id: 'app-agent',
    name: '陈书',
    color: 0xf5c542,
    task: '撰写：起草标书',
  },
  {
    id: 'review-agent',
    name: '刘市',
    color: 0xf97316,
    task: '市场：打包情报简报',
  },
  {
    id: 'data-agent',
    name: '赵审',
    color: 0x4ecdc4,
    task: '审核：合规待审队列',
  },
]
