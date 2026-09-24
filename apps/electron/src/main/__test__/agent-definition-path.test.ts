import { describe, expect, test } from 'bun:test';

import { agentDefinitionPath } from '../agent-definition-path';

describe('agent 定义键位路径（agentDir 派生缝）', () => {
  test('agentDir 在场：user 写 app 数据区 <agentDir>/agents', () => {
    expect(agentDefinitionPath({ homeDir: '/home/u', agentDir: '/data/agent' }, 'user', null, 'search')).toBe('/data/agent/agents/search.md');
  });

  test('agentDir 缺省：user 回落 ~/.x-harness/agents 共享目录', () => {
    expect(agentDefinitionPath({ homeDir: '/home/u' }, 'user', null, 'search')).toBe('/home/u/.x-harness/agents/search.md');
  });

  test('project 恒 <项目>/.x-harness/agents（不随 agentDir 变）', () => {
    expect(agentDefinitionPath({ homeDir: '/home/u', agentDir: '/data/agent' }, 'project', '/work/app', 'search')).toBe('/work/app/.x-harness/agents/search.md');
    expect(agentDefinitionPath({ homeDir: '/home/u' }, 'project', '/work/app', 'search')).toBe('/work/app/.x-harness/agents/search.md');
  });
});
