import { join as joinPaths } from 'node:path';

import type { AgentScope } from '@paiapp/contracts';

/** 定义键位（作用域 + 项目 + name）→ 定义文件绝对路径；调用方保证 stem 已过校验。
 *  布局契约（x-harness agents 域 agentDir 派生缝）：agentDir 在场 = user 定义写
 *  app 数据区 <agentDir>/agents；缺省回落 ~/.x-harness/agents 共享目录。project 恒
 *  <项目>/.x-harness/agents（仅受信会话加载；hub 热发现，app 直写同规）。 */
export function agentDefinitionPath(input: { homeDir: string; agentDir?: string }, scope: AgentScope, project: string | null, stem: string): string {
  const fileName = `${stem}.md`;
  if (scope === 'user') {
    return input.agentDir !== undefined && input.agentDir.length > 0
      ? joinPaths(input.agentDir, 'agents', fileName)
      : joinPaths(input.homeDir, '.x-harness', 'agents', fileName);
  }
  return joinPaths(project ?? '.', '.x-harness', 'agents', fileName);
}
