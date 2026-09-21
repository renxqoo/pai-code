/**
 * 渲染层视图模型：对话流与 Agent 面板的展示形状。
 * 会话真相在 hub；由状态机把事件流折叠成这些形状，组件不感知数据来源。
 */

import type { SubagentSpawnView } from '@paiapp/contracts';

/** system = 后台任务通知/子代理上报等以用户角色注入的系统信封消息（api.md §7.5）。 */
export type SessionMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  /** 用户消息的图片附件（data 为无前缀 base64，data URL 渲染）。 */
  images: ReadonlyArray<{ data: string; mimeType: string }>;
};

export type TurnStatus = 'running' | 'completed' | 'stopped';

/** 单次工具调用的展示状态：非零退出码必须能区别于成功。 */
export type ToolCallStatus = 'running' | 'ok' | 'failed' | 'stopped';

export type ToolCallModel = {
  id: string;
  /** 工具名（命令行调用为命令本体之外的工具名，如 Bash/Read） */
  name: string;
  /** 参数摘要（命令调用即命令文本） */
  argsPreview: string;
  /** task 工具的子代理执行清单（每个 item 一行展示）；其余工具为空数组 */
  subagents: readonly SubagentSpawnView[];
  output: string;
  /** null = 尚未结束 */
  exitCode: number | null;
  /** null = 尚未结束 */
  durationMs: number | null;
  status: ToolCallStatus;
};

/**
 * 子代理状态（x-harness ChildView 词表）：running = 执行中；idle = 存活未在跑；
 * stopped = 终态归档（可复活再 running）。
 */
export type SubagentStatus = 'running' | 'idle' | 'stopped';

export type SubagentModel = {
  /** 面板列表键 = agentId（x-harness 身份模型：agentId 唯一，type 为定义名展示键）。 */
  id: string;
  /** steer 寻址 id（subagent/steer 的 agentId 入参；'' = 未知，行内输入不显示）。 */
  agentId: string;
  name: string;
  /** 面板类型胶囊：Explore / general-purpose（x-harness 的 type 字段）。 */
  agentType: string;
  /** 任务摘要（agent/spawned work / 快照；'' = 未知——复活旧档案可能缺席）。 */
  task: string;
  model: string;
  effort: string;
  /** null = 无 token 计量，展示为占位符 */
  tokens: number | null;
  /** 已启动的工具调用数 */
  toolCount: number;
  status: SubagentStatus;
  /** 运行周期结局（agent/finished.outcome 原文）——failed 与 completed 面板可区分。 */
  endedWith?: 'completed' | 'stopped' | 'failed';
  startedAt: number;
  /** null = 仍在运行，耗时实时累加 */
  endedAt: number | null;
  /** 流式正文累积（终态展示为报告摘要） */
  summary: string;
  /** 权限请求等待态已退役（协议无 ask 归属信号——ui_request 无归属字段、decided 为事后帧）；保留 null 态。 */
  pendingAsk: { toolName: string; summary: string } | null;
  tools: readonly ToolCallModel[];
};

export type DiffFileModel = {
  path: string;
  additions: number;
  deletions: number;
};

export type DiffSummaryModel = {
  changedFiles: number;
  additions: number;
  deletions: number;
  files: readonly DiffFileModel[];
};

/** 轮次内容块：正文实时可见，过程块按轮次状态自动折叠为摘要。 */
export type TurnBlock =
  | { kind: 'text'; id: string; text: string }
  | { kind: 'thinking'; id: string; text: string }
  | { kind: 'tools'; id: string; calls: readonly ToolCallModel[] }
  | { kind: 'diff'; id: string; diff: DiffSummaryModel }
  /** 轮次异常终态（上游报错/中止）：收起态也保持可见的一行提示。 */
  | { kind: 'turnFailure'; id: string; stopReason: 'error' | 'aborted'; message: string | null };

export type TurnModel = {
  id: string;
  status: TurnStatus;
  startedAt: number;
  /** null = 仍在运行，计时走表 */
  endedAt: number | null;
  blocks: readonly TurnBlock[];
  /** 仍在流式输出的思考块 id（think-<messageId>；null = 无）。思考激活态是
   * 块粒度信号——同轮工具执行/正文流式期间，早已定形的思考不再挂「思考中」。 */
  streamingThinkingBlockId: string | null;
};

export type ThreadItem =
  | { kind: 'message'; message: SessionMessage }
  | { kind: 'turn'; turn: TurnModel };

export type ThreadModel = {
  sessionId: string;
  items: readonly ThreadItem[];
  /** 本会话全部直接派生的子代理（面板列表与流内子代理条的同一数据源） */
  agents: readonly SubagentModel[];
};
