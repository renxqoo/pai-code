/**
 * 子 agent 定义的静态词表（单一真相）。
 * 内置工具 id 是 hub/pi 工具注册表的协议事实：frontmatter tools 只认精确名，
 * 未知名被静默忽略（无通配符）；这里集中维护供表单多选与文件面校验共用。
 */
export const AGENT_TOOL_IDS = ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls', 'powershell'] as const;

export type AgentToolId = (typeof AGENT_TOOL_IDS)[number];

/**
 * agent 名（同时是定义文件名主干）。校验边界 = 文件名安全的必要集，不是命名风格规范：
 * 允许空格、中文等任意 Unicode（hub frontmatter name 本就无约束，"code reviewer" 这类
 * 名字是常态）；禁止的是会让文件路径失去意义或跨平台出错的形态——
 * 路径分隔符（/ \）与 Windows 禁字符（: * ? " < > |）、控制字符、点开头（. / ..
 * 保留）、首尾空白（部分工具会剥尾空格造成文件不可达）。长度 ≤ 64 字符。
 */
const AGENT_NAME_FORBIDDEN = /[/\\:*?"<>|]/;

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function isValidAgentName(name: string): boolean {
  if (name.length === 0 || name.length > 64) return false;
  if (name.startsWith('.') || name.endsWith(' ') || name.startsWith(' ')) return false;
  if (name !== name.trim()) return false;
  if (AGENT_NAME_FORBIDDEN.test(name)) return false;
  return !hasControlChar(name);
}

/** 定义作用域：user = agentDir/agents（全局）；project = <项目>/.pi/agents（仅受信会话）。 */
export type AgentScope = 'user' | 'project';
