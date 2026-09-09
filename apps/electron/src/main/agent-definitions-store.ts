import { mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeSync, fsyncSync, closeSync, existsSync, type Dirent } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname as dirnamePath } from 'node:path';

import { isValidAgentName, type AgentDefinition, type AgentScope } from '@paiapp/contracts';

import { agentDefinitionPath, fileNameStemOf, isSafeFileNameStem, parseAgentDefinition, serializeAgentDefinition } from './agent-definition-file';

/**
 * 子 agent 定义文件面（管理 CRUD 的单一实现）：
 * user 级 = <agentDir>/agents/<stem>.md；project 级 = <项目>/.pi/agents/<stem>.md。
 * hub 热发现这些目录（每次任务调用/枚举现读），写删即生效、零重启。
 * 身份键 = 文件名主干（file）：hub 只认 frontmatter name，手写文件 name 可与主干不等，
 * 编辑保存会归一到「主干 = name」的 app 不变式（写 <name>.md + 删旧 <file>.md）。
 * 写门禁：name 过 AGENT_NAME_PATTERN（构造上排除路径逃逸）；project 写入仅限调用方
 * 传入的已知项目集合。删除/旧文件定位用宽松的 stem 校验（手写主干可为任意无分隔符文本）。
 */

export type AgentDefinitionKey = { file: string; scope: AgentScope; project: string | null };

export type AgentDefinitionsStore = {
  /** 枚举 user 目录 + 各已知项目的 .pi/agents（快照读；坏文件跳过，与 hub 同语义）。 */
  list: (projects: readonly string[]) => AgentDefinition[];
  /** 新建/编辑/改名/移动统一：校验 → 原子写新文件 → 删旧键位文件（删除失败不影响结果，audit 由路由层记录）。 */
  upsert: (definition: AgentDefinition, previous: AgentDefinitionKey | null, projects: readonly string[]) => { ok: true } | { ok: false; reason: 'invalid_name' | 'invalid_project' | 'name_exists' | 'write_failed' };
  remove: (key: AgentDefinitionKey, projects: readonly string[]) => { ok: true } | { ok: false; reason: 'invalid_file' | 'invalid_project' | 'not_found' | 'remove_failed' };
};

function resolveTarget(agentDir: string, key: AgentDefinitionKey, projects: readonly string[]): string | null {
  if (!isSafeFileNameStem(key.file)) return null;
  if (key.scope === 'user') return agentDefinitionPath(agentDir, 'user', null, key.file);
  if (key.project === null || key.project.length === 0 || !projects.includes(key.project)) return null;
  return agentDefinitionPath(agentDir, 'project', key.project, key.file);
}

function readDirDefinitions(dir: string, scope: AgentScope, project: string | null, out: AgentDefinition[]): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    // hub 语义：定义文件含符号链接（isFile 或 isSymbolicLink）
    if ((!entry.isFile() && !entry.isSymbolicLink()) || !entry.name.endsWith('.md')) continue;
    const file = fileNameStemOf(entry.name);
    if (file === null) continue;
    let text: string;
    try {
      text = readFileSync(`${dir}/${entry.name}`, 'utf8');
    } catch {
      continue;
    }
    const parsed = parseAgentDefinition(text);
    if (parsed === null) continue;
    out.push({ ...parsed, scope, project, file });
  }
}

/** 原子写文本（tmp 随机名 + 独占创建 + fsync + rename；与 agent-dir-files 同型）。 */
function writeTextAtomic(filePath: string, text: string): boolean {
  let tmp: string | null = null;
  try {
    mkdirSync(dirnamePath(filePath), { recursive: true });
    tmp = `${filePath}.${randomUUID()}.tmp`;
    const fd = openSync(tmp, 'wx');
    try {
      writeSync(fd, Buffer.from(text, 'utf8'));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, filePath);
    return true;
  } catch {
    if (tmp !== null) {
      try {
        unlinkSync(tmp);
      } catch {
        // 残留 tmp 不被 hub/本面枚举识别（非 .md 后缀），接受
      }
    }
    return false;
  }
}

export function createAgentDefinitionsStore(agentDir: string): AgentDefinitionsStore {
  return {
    list(projects) {
      const out: AgentDefinition[] = [];
      readDirDefinitions(`${agentDir}/agents`, 'user', null, out);
      for (const project of projects) readDirDefinitions(`${project}/.pi/agents`, 'project', project, out);
      return out;
    },
    upsert(definition, previous, projects) {
      if (!isValidAgentName(definition.name)) return { ok: false, reason: 'invalid_name' };
      const scope: AgentScope = definition.scope;
      if (scope === 'project' && (definition.project === null || definition.project.length === 0 || !projects.includes(definition.project))) {
        return { ok: false, reason: 'invalid_project' };
      }
      // 新文件主干恒 = name（app 管理不变式；编辑手写的 name≠主干文件时即归一）
      const target = agentDefinitionPath(agentDir, scope, definition.project, definition.name);
      const sameFile = previous !== null && previous.file === definition.name && previous.scope === definition.scope && previous.project === definition.project;
      // 同键位覆盖允许；跨键位且目标已存在 = 重名（hub 的 project 覆盖 user 是运行期语义，文件面两级同名独立存在）
      if (!sameFile && existsSync(target)) return { ok: false, reason: 'name_exists' };
      const text = serializeAgentDefinition(definition);
      if (!writeTextAtomic(target, text)) return { ok: false, reason: 'write_failed' };
      if (previous !== null && !sameFile) {
        const stale = resolveTarget(agentDir, previous, projects);
        // 旧文件删除失败不回滚：新定义已生效（hub 按 name 收敛），残留文件下次编辑仍可达
        if (stale !== null && existsSync(stale)) {
          try {
            unlinkSync(stale);
          } catch {
            // 残留接受（见上）
          }
        }
      }
      return { ok: true };
    },
    remove(key, projects) {
      const target = resolveTarget(agentDir, key, projects);
      if (target === null) {
        if (!isSafeFileNameStem(key.file)) return { ok: false, reason: 'invalid_file' };
        return { ok: false, reason: 'invalid_project' };
      }
      if (!existsSync(target)) return { ok: false, reason: 'not_found' };
      try {
        unlinkSync(target);
      } catch {
        return { ok: false, reason: 'remove_failed' };
      }
      return { ok: true };
    },
  };
}
