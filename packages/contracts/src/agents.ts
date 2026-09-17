/**
 * 子 agent 定义的静态词表（单一真相，host-hub plugins/agents/src/registry.ts 镜像）。
 * frontmatter 严格四字段（name/description/tools/model；name/tools/model 可选缺省），
 * 未知字段拒绝；tools 只认精确名，未知名被静默忽略（无通配符）。
 * 布局：user = ~/.my-agent/agents；project = <项目>/.my-agent/agents（仅受信会话加载）。
 */

/** agent 工具 id 词表（host-hub 工具注册表的名字；agent 委派族恒剔除、不在表单面）。 */
export const AGENT_TOOL_IDS = ['read_file', 'write_file', 'edit_file', 'bash', 'grep'] as const;

export type AgentToolId = (typeof AGENT_TOOL_IDS)[number];

/**
 * agent 名（= 定义文件名主干）。host-hub NAME_PATTERN = ^[a-z0-9]+(-[a-z0-9]+)*$
 * （kebab-case）；保留名 fork/main 拒绝。description ≤500 字符（单行）。
 */
export const AGENT_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const AGENT_RESERVED_NAMES = new Set(['fork', 'main']);

export const AGENT_DESCRIPTION_MAX = 500;

export function isValidAgentName(name: string): boolean {
  if (!AGENT_NAME_PATTERN.test(name)) return false;
  return !AGENT_RESERVED_NAMES.has(name);
}

/** 定义作用域：user = ~/.my-agent/agents（hub agents/create|remove 命令面）；project = <项目>/.my-agent/agents（app 直写同格式）。 */
export type AgentScope = 'user' | 'project';
