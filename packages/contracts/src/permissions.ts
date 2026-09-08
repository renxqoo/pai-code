import { z } from 'zod';

/**
 * hub 权限规则文件 `agentDir/permission-rules.json`（v2）的形状镜像。
 * hub 每次工具调用热读：mode 先判（allow-all/block-all），再 blockPatterns、
 * 再 allowPatterns，否则 ask；缺文件/坏 JSON 降级 {mode:"ask"}。
 * glob 语义：`*` 跨任意字符（含 `/`），其余字面。
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

/** 缺文件/坏文件/校验失败的降级形态（与 hub 热读降级一致）。 */
export function defaultPermissionRules(): PermissionRules {
  return {
    mode: 'ask',
    bash: { allowPatterns: [], blockPatterns: [] },
    write: { allowPatterns: [], blockPatterns: [] },
    edit: { allowPatterns: [], blockPatterns: [] },
  };
}
