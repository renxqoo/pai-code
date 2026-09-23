/**
 * 技能安装端口（T42 D1=H，2026-09-23 用户裁决）：落盘与形态判定的唯一实现 = hub
 * `skills/inspect`|`skills/install` 命令面（x-harness docs/SKILL-INSTALL.md）。
 * app 侧**不实现任何装载器校验规则**——本文件只做 hub 命令的 typed 调用面与应答形状收窄；
 * hub 缺命令（< 60 词表的旧 hub）由 skills-import.ts 的映射层降级 skill_not_supported。
 */
import type { SkillsInstallData, SkillsInspectData } from '@paiapp/contracts';

import type { SettingsCommands } from '../commands/settings';
import type { HubResult } from '../errors';

export interface SkillInstallPort {
  /** 批量形态判定（结果与入参同序同数）。 */
  inspectSources(input: { sourcePaths: string[] }): Promise<HubResult<SkillsInspectData>>;
  /** 安装单个技能（name = 目标名，副本 frontmatter name 行由 hub 改写）。 */
  installSkill(input: { sourcePath: string; name?: string; overwrite?: boolean }): Promise<HubResult<SkillsInstallData>>;
}

/** hub 命令代理 → 安装端口（应答形状收窄在端口层单点；坏形状走 malformed 兜底不静默）。 */
export function createSkillInstallPort(commands: SettingsCommands): SkillInstallPort {
  return {
    async inspectSources(input) {
      const result = await commands.inspectSkills({ sourcePaths: input.sourcePaths });
      if (!result.ok) return result;
      const raw = (result.data as { results?: unknown }).results;
      if (!Array.isArray(raw)) return { ok: false, error: { kind: 'malformed_response' } };
      return { ok: true, data: { results: raw as SkillsInspectData['results'] } };
    },
    async installSkill(input) {
      const result = await commands.installSkill({
        sourcePath: input.sourcePath,
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.overwrite === undefined ? {} : { overwrite: input.overwrite }),
      });
      if (!result.ok) return result;
      const data = result.data as { name?: unknown; path?: unknown; skippedEntries?: unknown };
      if (typeof data?.name !== 'string' || typeof data?.path !== 'string') {
        return { ok: false, error: { kind: 'malformed_response' } };
      }
      return {
        ok: true,
        data: {
          name: data.name,
          path: data.path,
          skippedEntries: typeof data.skippedEntries === 'number' ? data.skippedEntries : 0,
        },
      };
    },
  };
}
