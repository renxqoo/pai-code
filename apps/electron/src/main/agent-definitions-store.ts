import { mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeSync, fsyncSync, closeSync, existsSync, type Dirent } from 'node:fs';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { dirname as dirnamePath } from 'node:path';

import { AGENT_FIELD_LINE, isValidAgentName, type AgentDefinition, type AgentScope } from '@paiapp/contracts';
import { fileNameStemOf, isSafeFileNameStem, parseAgentDefinition, serializeAgentDefinition } from '@paiapp/api';

import { agentDefinitionPath } from './agent-definition-path';

/**
 * 子 agent 定义文件面（project 级直写 + 两域枚举；x-harness 同格式热发现——写删即生效）：
 * user 级 = ~/.x-harness/agents/<name>.md（**写路径走 hub agents/create|remove 命令**——
 * round-trip 复析由 hub 保证，路由层分派；本面只读枚举）；
 * project 级 = <项目>/.x-harness/agents/<name>.md（app 直写）。
 * 身份键 = name（= 文件名主干，app 写入不变式）。
 * 写门禁（镜像 x-harness agents-admin 校验）：name 非空无 `/` 无换行、description
 * 非空单行且非字段形态行、systemPrompt 非空、model 单行；project 写入仅限调用方
 * 传入的已知项目集合——坏定义文件被 hub 静默跳过，校验缺失 = 用户定义静默消失。
 */

export type AgentDefinitionKey = { name: string; scope: AgentScope; project: string | null };

export type AgentDefinitionsStore = {
  /** 枚举 user 目录 + 各已知项目的 .x-harness/agents（快照读；坏文件跳过，与 hub 同语义）。 */
  list: (projects: readonly string[]) => AgentDefinition[];
  /** 新建/编辑/改名/移动统一：校验 → 原子写新文件 → 删旧键位文件（删除失败不影响结果，audit 由路由层记录）。 */
  upsert: (definition: AgentDefinition, previous: AgentDefinitionKey | null, projects: readonly string[]) => { ok: true } | { ok: false; reason: 'invalid_name' | 'invalid_description' | 'invalid_prompt' | 'invalid_model' | 'invalid_project' | 'name_exists' | 'write_failed' };
  remove: (key: AgentDefinitionKey, projects: readonly string[]) => { ok: true } | { ok: false; reason: 'invalid_name' | 'invalid_project' | 'not_found' | 'remove_failed' };
};

export function createAgentDefinitionsStore(homeDir: string = homedir()): AgentDefinitionsStore {
  const home = homeDir;

  const userDir = `${home}/.x-harness/agents`;
  const projectDir = (project: string): string => `${project}/.x-harness/agents`;

  /** 写前校验 = x-harness agents-admin 校验表镜像（非空/单行/非字段形态/单行 model）——
   *  坏定义文件被 hub 解析器静默跳过，校验缺失 = 用户定义静默消失。 */
  const validate = (definition: AgentDefinition): { ok: true } | { ok: false; reason: 'invalid_name' | 'invalid_description' | 'invalid_prompt' | 'invalid_model' } => {
    if (!isValidAgentName(definition.name)) return { ok: false, reason: 'invalid_name' };
    // 枚举可见性前置（hub 侧 round-trip 复析同目的）：stem 词法不可枚举的名字写了列不出
    // （. 开头/含反斜杠等）——静默丢失比拒绝更糟
    if (!isSafeFileNameStem(definition.name)) return { ok: false, reason: 'invalid_name' };
    const description = definition.description.trim();
    if (description.length === 0 || description.includes('\n') || AGENT_FIELD_LINE.test(description)) {
      return { ok: false, reason: 'invalid_description' };
    }
    if (definition.systemPrompt.trim().length === 0) return { ok: false, reason: 'invalid_prompt' };
    if (definition.model !== null && definition.model.length > 0 && (definition.model.includes('\n') || definition.model.trim().length === 0)) {
      return { ok: false, reason: 'invalid_model' };
    }
    return { ok: true };
  };

  const resolveTarget = (key: AgentDefinitionKey, projects: readonly string[]): string | null => {
    if (!isSafeFileNameStem(key.name)) return null;
    if (key.scope === 'user') return agentDefinitionPath(home, 'user', null, key.name);
    if (key.project === null || key.project.length === 0 || !projects.includes(key.project)) return null;
    return agentDefinitionPath(home, 'project', key.project, key.name);
  };

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
      const stem = fileNameStemOf(entry.name);
      if (stem === null) continue;
      let text: string;
      try {
        text = readFileSync(`${dir}/${entry.name}`, 'utf8');
      } catch {
        continue;
      }
      const parsed = parseAgentDefinition(text, stem);
      if (parsed === null) continue;
      out.push({ ...parsed, scope, project });
    }
  }

  /** 原子写文本（tmp 随机名 + 独占创建 + fsync + rename）。 */
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

  /** 按 frontmatter name 定位旧文件（手写文件主干可与 name 不等；主干=name 快径优先）。 */
  const locateByName = (key: AgentDefinitionKey, projects: readonly string[]): string | null => {
    const direct = resolveTarget(key, projects);
    if (direct !== null && existsSync(direct)) return direct;
    const dir = key.scope === 'user' ? userDir : key.project !== null && projects.includes(key.project) ? projectDir(key.project) : null;
    if (dir === null) return null;
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      try {
        const stem = fileNameStemOf(entry.name);
        if (stem === null) continue;
        const parsed = parseAgentDefinition(readFileSync(`${dir}/${entry.name}`, 'utf8'), stem);
        if (parsed !== null && parsed.name === key.name) return `${dir}/${entry.name}`;
      } catch {
        continue;
      }
    }
    return null;
  };

  return {
    list(projects) {
      const out: AgentDefinition[] = [];
      readDirDefinitions(userDir, 'user', null, out);
      for (const project of projects) readDirDefinitions(projectDir(project), 'project', project, out);
      return out;
    },
    upsert(definition, previous, projects) {
      const valid = validate(definition);
      if (!valid.ok) return valid;
      if (definition.scope === 'project' && (definition.project === null || definition.project.length === 0 || !projects.includes(definition.project))) {
        return { ok: false, reason: 'invalid_project' };
      }
      // 新文件主干恒 = name（app 管理不变式；编辑手写的 name≠主干文件时即归一）
      const target = agentDefinitionPath(home, definition.scope, definition.project, definition.name);
      const sameKey =
        previous !== null && previous.name === definition.name && previous.scope === definition.scope && previous.project === definition.project;
      // 同键位覆盖允许；跨键位且目标已存在 = 重名（hub 的 project 覆盖 user 是运行期语义，文件面两级同名独立存在）
      if (!sameKey && existsSync(target)) return { ok: false, reason: 'name_exists' };
      const text = serializeAgentDefinition(definition);
      if (!writeTextAtomic(target, text)) return { ok: false, reason: 'write_failed' };
      if (previous !== null && !sameKey) {
        const stale = locateByName(previous, projects);
        // 旧文件删除失败不回滚：新定义已生效（hub 按 name 收敛），残留文件下次编辑仍可达
        if (stale !== null && stale !== target) {
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
      const target = locateByName(key, projects);
      if (target === null) {
        if (!isSafeFileNameStem(key.name)) return { ok: false, reason: 'invalid_name' };
        return { ok: false, reason: key.scope === 'project' && (key.project === null || !projects.includes(key.project)) ? 'invalid_project' : 'not_found' };
      }
      try {
        unlinkSync(target);
      } catch {
        return { ok: false, reason: 'remove_failed' };
      }
      return { ok: true };
    },
  };
}
