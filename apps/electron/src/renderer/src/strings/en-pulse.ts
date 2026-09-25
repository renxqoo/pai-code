/** 速览面板文案（en 定型键结构；zh 表编译期对齐）。 */
export const enPulse = {
  title: 'Pulse',
  aria: 'Pulse panel (Git, tasks and agents)',
  collapse: 'Collapse pulse panel',
  expand: 'Expand pulse panel',
  chipAria: (summary: string): string => `Pulse: ${summary}. Expand panel`,
  git: {
    changes: 'Changes',
    changesAria: (files: number): string => `${files} changed file${files === 1 ? '' : 's'} — open the Diff panel`,
    notRepo: 'Not a Git repository',
    unavailable: 'Git status unavailable',
    retry: 'Retry',
    branchAria: (branch: string): string => `Current branch ${branch} — switch branch`,
    noBranch: '(no branch)',
    upstream: (ahead: number, behind: number): string => `↑${ahead} ↓${behind}`,
    graph: 'Open Git graph',
  },
  todo: {
    section: 'Tasks',
    progress: (done: number, total: number): string => `${done}/${total}`,
    rowAria: (subject: string): string => `Task: ${subject}`,
    statusDone: 'Completed',
    statusDoing: 'In progress',
    statusPending: 'Pending',
  },
  agents: {
    section: 'Agents',
    working: (count: number): string => `${count} working`,
    rowAria: (name: string): string => `Subagent ${name} — open the Agents panel`,
  },
  running: {
    aria: (count: number): string => `${count} subagent${count === 1 ? '' : 's'} running — open the Agents panel`,
    more: (count: number): string => `+${count}`,
  },
};
