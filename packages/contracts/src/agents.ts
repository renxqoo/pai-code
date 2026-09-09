/**
 * 子 agent 定义的静态词表（单一真相）。
 * 内置工具 id 是 hub/pi 工具注册表的协议事实：frontmatter tools 只认精确名，
 * 未知名被静默忽略（无通配符）；这里集中维护供表单多选与文件面校验共用。
 */
export const AGENT_TOOL_IDS = ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls', 'powershell'] as const;

export type AgentToolId = (typeof AGENT_TOOL_IDS)[number];

/**
 * agent 名（同时是定义文件名主干）：字母/数字开头，仅含 字母数字 . _ -，
 * 长度 1..64。构造上排除路径分隔符与 ..，杜绝定义文件写入的路径逃逸。
 */
export const AGENT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function isValidAgentName(name: string): boolean {
  return AGENT_NAME_PATTERN.test(name);
}

/** 定义作用域：user = agentDir/agents（全局）；project = <项目>/.pi/agents（仅受信会话）。 */
export type AgentScope = 'user' | 'project';
