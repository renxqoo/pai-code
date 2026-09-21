import { describe, expect, test } from 'bun:test';

import { agentDefinitionPath } from '../agent-definition-path';

describe('agent 定义键位路径', () => {
  test('user 固定 <home>/.x-harness/agents；project 固定 <项目>/.x-harness/agents', () => {
    expect(agentDefinitionPath('/home/u', 'user', null, 'search')).toBe('/home/u/.x-harness/agents/search.md');
    expect(agentDefinitionPath('/home/u', 'project', '/work/app', 'search')).toBe('/work/app/.x-harness/agents/search.md');
  });
});
