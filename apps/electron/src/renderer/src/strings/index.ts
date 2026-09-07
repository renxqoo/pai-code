/**
 * 用户可见文案单一真相：组件与主流程禁止硬编码文案，一律从这里取 key。
 * 取值与设计稿逐字一致；菜单选项为对应控件的固定可选项；
 * 带数量的文案在这里做单复数与拼接，组件只传数字。
 */
export const copy = {
  /** 标题行双色文案：名称重字重、产品线后缀轻字重（与设计稿一致） */
  appTitle: { name: 'T3', suffix: 'Code' },
  sidebar: {
    search: 'Search',
    newThread: 'New thread',
    allProjects: 'All projects',
    newProject: 'New project folder',
    toggleSidebar: 'Toggle sidebar',
    settings: 'Settings',
    workflows: 'Workflows',
    usage: 'Usage',
    refresh: 'Refresh sessions',
  },
  thread: {
    addAction: 'Add action',
    open: 'Open',
    commitPushPr: 'Commit, push & PR',
    toggleSplitView: 'Toggle split view',
    toggleMaximize: 'Toggle maximize',
    openMenu: ['Open in Finder', 'Open in Terminal', 'Open in Editor'] as readonly string[],
    commitMenu: ['Commit only', 'Create pull request', 'Push to remote'] as readonly string[],
    emptyTitle: 'No messages yet',
    emptyHint: 'Describe a change, a question, or a task to get started.',
    tabDiff: 'Diff',
    tabAgents: 'Agents',
    tabAdd: 'Add panel',
    tabDiffHint: 'Open diff panel',
  },
  flow: {
    workingFor: 'Working for',
    workedFor: 'Worked for',
    /** Windows caption 三键（自绘标题栏） */
    captionMinimize: 'Minimize',
    captionMaximize: 'Maximize',
    captionRestore: 'Restore',
    captionClose: 'Close',
    /** 折叠摘要：Ran 3 commands */
    commandsSummary: (count: number): string => (count === 1 ? 'Ran 1 command' : `Ran ${count} commands`),
    /** 折叠摘要：Kicked off 4 subagents */
    subagentsSummary: (count: number): string =>
      count === 1 ? 'Kicked off 1 subagent' : `Kicked off ${count} subagents`,
    /** 折叠摘要：375 changed files */
    changedFiles: (count: number): string => (count === 1 ? '1 changed file' : `${count} changed files`),
    showFiles: 'Show files',
    hideFiles: 'Hide files',
    openDiff: 'Open diff',
    openAgents: 'Open Agents',
    closeAgents: 'Close agents panel',
    toggleAgents: 'Toggle agents panel',
    toggleDiff: 'Toggle diff panel',
    panelTitle: 'DIRECT SPAWNS',
    agentsPanelEmpty: 'No subagents spawned yet',
    diffPanelTitle: 'FILE CHANGES',
    diffPanelEmpty: 'No file changes in this session yet',
    closeDiffPanel: 'Close diff panel',
    codeLabel: 'Code',
    copyCode: 'Copy code',
    statusThinking: 'Thinking',
    statusWorking: 'Working',
    toolStopped: 'Stopped',
    toolRunning: 'Running',
    /** 中断轮次的状态行：Stopped · 8m 0s */
    turnStoppedSummary: (elapsed: string): string => `Stopped · ${elapsed}`,
    thinking: 'Thinking',
    queued: (count: number): string => (count === 1 ? '1 queued message' : `${count} queued messages`),
    retrying: (attempt: number, maxAttempts: number): string => `Retrying (${attempt}/${maxAttempts})`,
    crashedBanner: 'This conversation hit a worker crash and is recovering. The next command resumes it automatically.',
    compacting: 'Compacting context…',
    systemMessageLabel: 'System',
    toolFailed: (exitCode: number): string => `exit ${exitCode}`,
    copyMessage: 'Copy message',
    editMessage: 'Edit message',
    scrollToBottom: 'Scroll to latest',
    copyCommand: 'Copy command',
    copyOutput: 'Copy output',
    copied: 'Copied',
    outputLabel: 'Output',
    toggleOutput: 'Toggle command output',
    /** 面板汇总：2 working 3 settled */
    panelWorking: (count: number): string => (count === 1 ? '1 working' : `${count} working`),
    panelSettled: (count: number): string => (count === 1 ? '1 settled' : `${count} settled`),
    /** 通知条右侧：4 working Σ 196 */
    notifySummary: (workingCount: number, tokens: number): string =>
      `${workingCount === 1 ? '1 working' : `${workingCount} working`} Σ ${tokens}`,
    /** 面板右下角：Σ 6.6k tok */
    footerTokens: (tokens: string): string => `Σ ${tokens} tok`,
    /** 元信息段：51 tok / — tok */
    metaTokens: (tokens: string | null): string => (tokens === null ? '— tok' : `${tokens} tok`),
    /** 元信息段：7 tools；无工具调用时为 null，整段省略 */
    metaTools: (count: number): string | null => {
      if (count <= 0) return null;
      return count === 1 ? '1 tool' : `${count} tools`;
    },
  },
  composer: {
    placeholder: 'Ask anything, @tag files/folders, $use skills, or / for commands',
    attach: 'Attach images and files',
    send: 'Send message',
    stop: 'Stop generating',
    contextUsage: 'Context used',
    localCheckout: 'Local checkout',
    checkoutMenu: ['main', 'v0.6.1', 'v0.6.2'] as readonly string[],
    effortMenu: ['Low · 200K', 'Medium · 200K', 'High · 1M'] as readonly string[],
    accessMenu: ['Read-only', 'Ask every time', 'Full access'] as readonly string[],
  },
  dialogs: {
    confirmTitle: 'Confirmation required',
    selectTitle: 'Choose an option',
    inputTitle: 'Input requested',
    allow: 'Allow',
    deny: 'Deny',
    cancel: 'Cancel',
    send: 'Submit',
    noOptions: 'No options provided',
    morePending: (count: number): string => (count === 1 ? '1 more request waiting' : `${count} more requests waiting`),
    fromSubagent: (agent: string): string => `Requested by subagent · ${agent}`,
  },
  settings: {
    title: 'Settings',
    close: 'Close',
    providersTitle: 'Providers',
    providersEmpty: 'No providers configured yet. Add one to start chatting.',
    addProvider: 'Add provider (OpenAI-compatible)',
    fieldName: 'Name (e.g. glm)',
    fieldBaseUrl: 'Base URL (e.g. https://open.bigmodel.cn/api/paas/v4)',
    fieldModels: 'Model ids (comma separated)',
    fieldKey: 'API key (leave blank to keep existing)',
    keyPresent: 'key saved',
    keyMissing: 'key missing',
    save: 'Save provider',
    remove: 'Remove',
    confirmRemove: 'Confirm remove',
    formIncomplete: 'Name, base URL and at least one model id are required.',
    formFailed: 'Save failed. Check the values and try again.',
    historyTitle: 'History',
    historyEmpty: 'No saved sessions yet.',
    refresh: 'Refresh',
  },
  newThread: {
    title: 'New conversation',
    hint: 'Pick the folder this conversation works in. The agent reads and edits files under this directory.',
    fieldCwd: '/path/to/project',
    create: 'Start conversation',
  },
  notices: {
    dismiss: 'Dismiss',
  },
} as const;
