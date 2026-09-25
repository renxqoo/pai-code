import type { enPulse } from './en-pulse';

/** 速览面板文案（中文；key 结构与 en 表逐字段对齐，类型强制同步）。 */
export const zhPulse: typeof enPulse = {
  title: '速览',
  aria: '速览面板（Git、进程与智能体）',
  collapse: '收起速览面板',
  expand: '展开速览面板',
  chipAria: (summary: string): string => `速览：${summary}。展开面板`,
  git: {
    changes: '更改',
    changesAria: (files: number): string => `${files} 个文件变更，打开 Diff 面板`,
    notRepo: '非 Git 仓库',
    unavailable: 'Git 状态不可用',
    retry: '重试',
    branchAria: (branch: string): string => `当前分支 ${branch}，切换分支`,
    noBranch: '（当前无分支）',
    upstream: (ahead: number, behind: number): string => `↑${ahead} ↓${behind}`,
    graph: '打开 Git 图谱',
  },
  todo: {
    section: '进程',
    progress: (done: number, total: number): string => `${done}/${total}`,
    rowAria: (subject: string): string => `任务：${subject}`,
    statusDone: '已完成',
    statusDoing: '进行中',
    statusPending: '待办',
  },
  agents: {
    section: '智能体',
    working: (count: number): string => `${count} 工作中`,
    rowAria: (name: string): string => `子智能体 ${name}，打开 Agents 面板`,
  },
  running: {
    aria: (count: number): string => `${count} 个子智能体运行中，打开 Agents 面板`,
    more: (count: number): string => `+${count}`,
  },
};
