/**
 * 子 agent 定义的静态词表（单一真相，x-harness delegation 装载格式 + agents-admin
 * 校验表镜像）。frontmatter 四字段（name/description/model?/tools? 逗号分隔）+ 正文
 * = systemPrompt；round-trip 由 hub 装载器保证。
 * 布局：user = ~/.x-harness/agents（hub agents/create|remove 命令面）；project =
 * <项目>/.x-harness/agents（仅受信会话加载，app 直写同格式）。
 */

/** agent 工具 id 词表（x-harness 工具注册表的名字；agent 委派族恒剔除、不在表单面）。 */
export const AGENT_TOOL_IDS = ['read', 'write', 'bash', 'grep'] as const;

export type AgentToolId = (typeof AGENT_TOOL_IDS)[number];

/**
 * agent 名（= 定义文件名主干）。x-harness 规则：非空、不含 `/`、不含换行
 * （无 kebab 正则与保留名——与现存同名在 create/remove 时由 hub 判重）。
 */
export function isValidAgentName(name: string): boolean {
  return name.length > 0 && !name.includes('/') && !name.includes('\n');
}

/** description 字段形态行（frontmatter 注入防线——x-harness FIELD_LINE 镜像）。 */
export const AGENT_FIELD_LINE = /^[a-zA-Z-]+:/;

/** 定义作用域：user = ~/.x-harness/agents（hub agents/create|remove 命令面）；project = <项目>/.x-harness/agents（app 直写同格式）。 */
export type AgentScope = 'user' | 'project';
