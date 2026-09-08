import { z } from 'zod';

/**
 * hub 权限规则文件 `agentDir/permission-rules.json`（v2）的形状镜像。
 * hub 每次工具调用热读：mode 先判（allow-all/block-all），再 blockPatterns、
 * 再 allowPatterns，否则 ask；glob 语义：`*` 跨任意字符（含 `/`），其余字面。
 *
 * 磁盘文件是 hub 的宽容域（字段可省、未知键忽略——hub rules.ts normalizeRules），
 * `parsePermissionRules` 镜像该语义收窄为完整视图；`PermissionRulesSchema`
 * 是写入口与应用内视图的严格形态（渲染层只能提交完整规则）。
 */

const patternGroups = z
  .object({
    allowPatterns: z.array(z.string()),
    blockPatterns: z.array(z.string()),
  })
  .strict();

export const PermissionRulesSchema = z
  .object({
    mode: z.enum(['ask', 'allow-all', 'block-all']),
    bash: patternGroups,
    write: patternGroups,
    edit: patternGroups,
  })
  .strict();
export type PermissionRules = z.infer<typeof PermissionRulesSchema>;

/** 缺文件/坏文件/非对象的降级形态（与 hub 热读降级一致）。 */
export function defaultPermissionRules(): PermissionRules {
  return {
    mode: 'ask',
    bash: { allowPatterns: [], blockPatterns: [] },
    write: { allowPatterns: [], blockPatterns: [] },
    edit: { allowPatterns: [], blockPatterns: [] },
  };
}

/** 深拷贝（数组引用全新）：写路径持有的规则不得与 store/草稿共享引用。 */
export function clonePermissionRules(rules: PermissionRules): PermissionRules {
  return {
    mode: rules.mode,
    bash: { allowPatterns: [...rules.bash.allowPatterns], blockPatterns: [...rules.bash.blockPatterns] },
    write: { allowPatterns: [...rules.write.allowPatterns], blockPatterns: [...rules.write.blockPatterns] },
    edit: { allowPatterns: [...rules.edit.allowPatterns], blockPatterns: [...rules.edit.blockPatterns] },
  };
}

function stringsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function groupOf(value: unknown): { allowPatterns: string[]; blockPatterns: string[] } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { allowPatterns: [], blockPatterns: [] };
  }
  const record = value as Record<string, unknown>;
  return { allowPatterns: stringsOf(record['allowPatterns']), blockPatterns: stringsOf(record['blockPatterns']) };
}

/**
 * 宽容解析（镜像 hub normalizeRules）：mode/三个工具组可省、未知键忽略、
 * 组内数组缺省为空、非字符串项丢弃；非对象整体降级默认。
 * 保证「hub 正在生效的部分规则」在 Pai 视图中完整呈现，不被整档清空。
 */
export function parsePermissionRules(data: unknown): PermissionRules {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return defaultPermissionRules();
  const record = data as Record<string, unknown>;
  const mode = record['mode'];
  return {
    mode: mode === 'allow-all' || mode === 'block-all' ? mode : 'ask',
    bash: groupOf(record['bash']),
    write: groupOf(record['write']),
    edit: groupOf(record['edit']),
  };
}
