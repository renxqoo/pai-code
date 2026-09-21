import { join as joinPaths } from 'node:path';

import type { AgentScope } from '@paiapp/contracts';

/**
 * 子 agent 定义文件（markdown）编解码。
 * 写侧 = x-harness renderAgentType 同构（round-trip 由 hub 装载器保证）：
 * frontmatter name/description/model?/tools?（逗号分隔）+ 正文 = systemPrompt；
 * name 非空无 `/` 无换行、description 单行且非字段形态行。
 * 读侧比写侧宽容（无/单/双引号标量、尾注释、块列表/逗号串/flow 数组——手写文件
 * 仍可枚举），name 缺省回落文件名主干；未知字段忽略。
 */
export type AgentDefinitionFile = {
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[] | null;
  model: string | null;
};

/** 序列化为 md 文本（x-harness renderAgentType 同构：name 入档 + tools 逗号分隔）；
 *  tools/model 为 null 或空时整个字段不写（= hub 运行期继承语义）。 */
export function serializeAgentDefinition(def: AgentDefinitionFile): string {
  const lines: string[] = ['---', `name: ${def.name}`, `description: ${def.description}`];
  if (def.model !== null && def.model.length > 0) lines.push(`model: ${def.model}`);
  if (def.tools !== null && def.tools.length > 0) lines.push(`tools: ${def.tools.join(',')}`);
  lines.push('---', '', def.systemPrompt, '');
  return `${lines.join('\n')}`;
}

/**
 * 无引号标量的尾注释剥离（YAML：` #` 起注释）；引号标量内的 # 是内容，不剥。
 * 返回 [值, 是否带引号]。
 */
function splitInlineComment(raw: string): { value: string; quoted: boolean } {
  const trimmed = raw.trim();
  if (trimmed.length >= 2 && (trimmed.startsWith("'") || trimmed.startsWith('"'))) {
    const quote = trimmed[0] as string;
    if (trimmed.endsWith(quote)) return { value: trimmed, quoted: true };
  }
  const commentAt = trimmed.indexOf(' #');
  return { value: commentAt === -1 ? trimmed : trimmed.slice(0, commentAt).trimEnd(), quoted: false };
}

/** 剥标量引号：单引号（内部 '' 还原）/ 双引号；无引号原样（尾注释已由调用方剥离）。 */
function stripQuoted(value: string): string {
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
  return value;
}

/** flow 数组 `[a, b]` → [a, b]；`[]` → []；非 flow 形态返回 null。 */
function parseFlowArray(raw: string): string[] | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;
  const inner = trimmed.slice(1, -1).trim();
  if (inner.length === 0) return [];
  return inner
    .split(',')
    .map((item) => stripQuoted(item.trim()))
    .filter((item) => item.length > 0);
}

/** 解析单行 `key: value`（引号标量 / 无引号 + 尾注释 / flow 数组）；不匹配返回 null。 */
function parseScalarLine(line: string): { key: string; value: string; flow: string[] | null } | null {
  const match = /^([A-Za-z][A-Za-z0-9_-]*):([ \t]*(.*))?$/.exec(line);
  if (match === null) return null;
  const key = match[1];
  if (key === undefined) return null;
  const rest = match[3];
  if (rest === undefined || rest.trim().length === 0) return { key, value: '', flow: null };
  const { value, quoted } = splitInlineComment(rest);
  if (quoted) return { key, value: stripQuoted(value), flow: null };
  const flow = parseFlowArray(value);
  if (flow !== null) return { key, value: '', flow };
  return { key, value: stripQuoted(value), flow: null };
}

/** 列表项 `- value`（容忍引号标量）；不匹配返回 null。 */
function parseListItem(line: string): string | null {
  const match = /^\s+-\s+(.+)$/.exec(line);
  if (match === null) return null;
  const item = match[1];
  if (item === undefined) return null;
  return stripQuoted(splitInlineComment(item).value);
}

/** frontmatter 边界（容忍 BOM 与栅栏行尾空格）→ [frontmatter, body]；不匹配 null。 */
function splitFrontmatter(text: string): [string, string] | null {
  const stripped = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const open = /^---[ \t]*\r?\n/.exec(stripped);
  if (open === null) return null;
  const afterOpen = stripped.slice(open[0].length);
  const close = /\r?\n---[ \t]*(?:\r?\n|$)/.exec(afterOpen);
  if (close === null) return null;
  return [afterOpen.slice(0, close.index), afterOpen.slice(close.index + close[0].length)];
}

/**
 * 宽容解析：name 可缺省（缺省 = 文件名主干——stem 由调用方传入；x-harness 写侧
 * 恒入档，缺省是手写旧档形态）；description 缺失 → null（与 hub「单文件跳过」
 * 同语义）；tools 三形态（块列表 / 逗号串 / flow 数组）取首个非空；未知字段忽略。
 */
export function parseAgentDefinition(text: string, stemFallback?: string): AgentDefinitionFile | null {
  const parts = splitFrontmatter(text);
  if (parts === null) return null;
  const lines = parts[0].split(/\r?\n/);
  let name: string | null = null;
  let description: string | null = null;
  let model: string | null = null;
  let toolsList: string[] | null = null;
  let toolsInline: string | null = null;
  let toolsInlineSeen = false;
  let inToolsList = false;
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const listItem = parseListItem(line);
    if (listItem !== null) {
      if (inToolsList && toolsList !== null) toolsList.push(listItem);
      continue;
    }
    const parsed = parseScalarLine(line);
    if (parsed === null) {
      inToolsList = false;
      continue;
    }
    inToolsList = false;
    if (parsed.key === 'name') name = parsed.value;
    else if (parsed.key === 'description') description = parsed.value;
    else if (parsed.key === 'model') model = parsed.value;
    else if (parsed.key === 'tools') {
      if (parsed.flow !== null) {
        toolsList = parsed.flow;
        toolsInline = null;
        toolsInlineSeen = false;
        inToolsList = false;
      } else {
        toolsInline = parsed.value;
        toolsInlineSeen = true;
        toolsList = [];
        inToolsList = true;
      }
    }
  }
  const resolvedName = name !== null && name.length > 0 ? name : stemFallback !== undefined && stemFallback.length > 0 ? stemFallback : null;
  if (resolvedName === null) return null;
  if (description === null) return null;
  let tools: string[] | null = null;
  if (toolsList !== null && toolsList.length > 0) tools = toolsList;
  else if (toolsInlineSeen && toolsInline !== null && toolsInline.length > 0) {
    tools = toolsInline.split(',').map((tool) => tool.trim()).filter((tool) => tool.length > 0);
  }
  return {
    name: resolvedName,
    description,
    systemPrompt: parts[1].replace(/^\r?\n/, ''),
    tools: tools !== null && tools.length > 0 ? tools : null,
    model: model !== null && model.length > 0 ? model : null,
  };
}

/** 删除/定位旧文件的文件名主干校验（比写路径 pattern 宽：手写文件主干可为任意无分隔符文本）。 */
export function isSafeFileNameStem(stem: string): boolean {
  return stem.length > 0 && !stem.includes('/') && !stem.includes('\\') && !stem.startsWith('.') && stem !== '..' && stem.length <= 128;
}

/** 定义文件名主干（枚举源文件的身份键）；非 .md 或空主干返回 null。 */
export function fileNameStemOf(fileName: string): string | null {
  if (!fileName.endsWith('.md')) return null;
  const stem = fileName.slice(0, -3);
  return isSafeFileNameStem(stem) ? stem : null;
}

/** 定义键位（作用域 + 项目 + name）→ 定义文件绝对路径；调用方保证 stem 已过校验。
 *  布局契约（x-harness agents 域）：user = ~/.x-harness/agents；project =
 *  <项目>/.x-harness/agents（仅受信会话加载；hub 热发现，app 直写同规）。 */
export function agentDefinitionPath(homeDir: string, scope: AgentScope, project: string | null, stem: string): string {
  const fileName = `${stem}.md`;
  if (scope === 'user') return joinPaths(homeDir, '.x-harness', 'agents', fileName);
  return joinPaths(project ?? '.', '.x-harness', 'agents', fileName);
}
