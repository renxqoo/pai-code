import { join as joinPaths } from 'node:path';

import type { AgentScope } from '@paiapp/contracts';

/** 定义键位（作用域 + 项目 + name）→ 定义文件绝对路径；调用方保证 stem 已过校验。
 *  布局契约（x-harness agents 域）：user = ~/.x-harness/agents；project =
 *  <项目>/.x-harness/agents（仅受信会话加载；hub 热发现，app 直写同规）。 */
export function agentDefinitionPath(homeDir: string, scope: AgentScope, project: string | null, stem: string): string {
  const fileName = `${stem}.md`;
  if (scope === 'user') return joinPaths(homeDir, '.x-harness', 'agents', fileName);
  return joinPaths(project ?? '.', '.x-harness', 'agents', fileName);
}
