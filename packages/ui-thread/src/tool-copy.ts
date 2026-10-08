/**
 * 执行过程的结构化文案表（注入面）：共享派生函数不 import 任何一端的 strings
 * （`@/strings` 是各 app 的路径别名，共享包引不到），由两端各自的 strings
 * 适配层提供对应语言的词表——中英文表仍是各端唯一真相。
 */
export type ToolCopy = {
  /** 组头短语（桶序 = 短语序：编辑 → 阅读 → 搜索 → 目录 → 命令 → 子智能体 → 未知） */
  groupBashPhrase: string;
  groupListPhrase: string;
  groupEditPhrase: string;
  groupReadPhrase: string;
  groupSearchPhrase: string;
  groupSubagentPhrase: string;
  /** 未知工具桶：直接点名工具（混合桶超过列举上限以「等」收口） */
  groupOtherPhrase: (name: string) => string;
  groupMorePhrase: string;
  /** 短语连接（中文无连接词直拼，英文逗号分隔） */
  groupPhraseJoin: (phrases: readonly string[]) => string;
  /**
   * 计数式短语（整轮过程组的折叠标题：「编辑 3 个文件, 思考 2 次, 执行 1 条命令」）。
   * 与动宾流水版并存——后者服务消息级并行批次的组头。
   */
  groupCountEdit: (count: number) => string;
  groupCountThinking: (count: number) => string;
  groupCountRead: (count: number) => string;
  groupCountSearch: (count: number) => string;
  groupCountList: (count: number) => string;
  groupCountBash: (count: number) => string;
  groupCountSubagent: (count: number) => string;
  groupCountOther: (count: number, name: string) => string;
  /** 计数短语的连接（与 turnChangedFiles「· 改了 3 个文件」同一语感） */
  groupCountJoin: (phrases: readonly string[]) => string;
  /** 执行行已完成前缀（状态写进动词；后面紧跟具体文件/命令摘要，不带名词） */
  rowDoneBash: string;
  rowDoneRead: string;
  rowDoneEdit: string;
  rowDoneWrite: string;
  rowDoneSearch: string;
  rowDoneList: string;
  rowDoneSubagent: string;
  rowDoneOther: (name: string) => string;
  /** 执行行的失败/停止前缀（整句成「运行失败」，不靠行尾颜色区分） */
  rowFailed: string;
  rowStopped: string;
  rowFailedOther: (name: string) => string;
  rowStoppedOther: (name: string) => string;
  /** 执行行运行中前缀（进行时，与已完成态区分） */
  rowRunningBash: string;
  rowRunningRead: string;
  rowRunningEdit: string;
  rowRunningWrite: string;
  rowRunningSearch: string;
  rowRunningList: string;
  rowRunningSubagent: string;
  rowRunningOther: (name: string) => string;
};
