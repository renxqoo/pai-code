import { homedir } from 'node:os';
import { join as joinPaths } from 'node:path';

import { previewCommands } from '@paiapp/adapter';
import type { CommandView } from '@paiapp/contracts';

import type { AgentDirFiles } from './agent-dir-files';
import { buildSkillInventory, parseSkillPatterns, toggleSkillPatterns, type SkillEntry } from './skills-inventory';

export interface SkillsCatalogDeps {
  /** agentDir 根（默认技能源解析）。 */
  agentDir: string;
  /** agentDir 受控文件面（固定文件名白名单，原子写）。 */
  agentDirFiles: AgentDirFiles;
  /** 用户级技能目录源（默认 agentDir/skills + ~/.agents/skills；测试注入替身）。 */
  skillSources?: () => ReadonlyArray<{ origin: 'agent' | 'agents'; dir: string }>;
}

/**
 * 用户级技能目录装配（设置页清单/启停 + 新任务页预构命令目录）：
 * 启停真相 = agentDir/settings.json 的 skills overrides（pi 语义），
 * 目录扫描规则镜像 pi（skills-inventory）。
 */
export function createSkillsCatalog(deps: SkillsCatalogDeps) {
  const resolveSkillSources =
    deps.skillSources ??
    (() => [
      { origin: 'agent' as const, dir: joinPaths(deps.agentDir, 'skills') },
      { origin: 'agents' as const, dir: joinPaths(homedir(), '.agents', 'skills') },
    ]);

  /** pi settings.json 宽容读取（白名单文件面；坏/缺按 {} 起步）。 */
  const readPiSettings = (): Record<string, unknown> => {
    const raw = deps.agentDirFiles.readJson('settings.json');
    return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  };

  const list = (): SkillEntry[] => buildSkillInventory(resolveSkillSources(), parseSkillPatterns(readPiSettings()));

  return {
    list,
    /** 预会话命令目录（新建任务页 `/` 补全数据源）：用户级启用技能以 skill: 条目预构。 */
    previewCommands: (): CommandView[] => previewCommands(list().filter((skill) => skill.enabled)),
    /** 启停（同步读-改-写，无 yield 点不交错）；null = 成功。 */
    setEnabled: (name: string, enabled: boolean): 'skill_not_found' | 'write_failed' | null => {
      if (!list().some((skill) => skill.name === name)) return 'skill_not_found';
      try {
        const piSettings = readPiSettings();
        const next = toggleSkillPatterns(parseSkillPatterns(piSettings), name, enabled);
        const written = deps.agentDirFiles.writeJsonAtomic('settings.json', { ...piSettings, skills: next });
        return written ? null : 'write_failed';
      } catch {
        return 'write_failed';
      }
    },
  };
}
