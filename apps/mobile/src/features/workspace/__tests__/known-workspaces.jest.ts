/**
 * 候选边界：工作空间只能来自电脑端「已有对话」的目录。
 * 电脑上存在但没有对话的目录不得出现（设备面无列目录能力，目录树不可达）；
 * 归档对话（落盘但不在宿主表）算已有对话，仍在候选内。
 */
import { describe, expect, it } from '@jest/globals';

import { buildKnownWorkspaces, filterWorkspaces } from '../known-workspaces';
import { testSession } from '@/test/session-fixture';

describe('工作空间候选边界', () => {
  it('只有已有对话的目录进入候选（症状：电脑上有目录但没对话也被列出来）', () => {
    const workspaces = buildKnownWorkspaces([
      testSession('a', { project: '/work/agent-app' }),
      testSession('b', { project: '/work/agent-app' }),
      testSession('c', { project: '' }),
      testSession('d', { project: '/work/never-touched' }),
    ]);
    expect(workspaces.map((workspace) => workspace.path)).toEqual(['/work/agent-app', '/work/never-touched']);
  });

  it('归档对话的目录同样在候选内（归档也是电脑端已有的对话）', () => {
    const workspaces = buildKnownWorkspaces([
      testSession('live', { project: '/work/live-project' }),
      testSession('archived', { project: '/work/archived-project' }),
    ]);
    expect(workspaces.map((workspace) => workspace.name)).toEqual(['archived-project', 'live-project']);
  });

  it('按路径或目录名过滤，空查询为全量', () => {
    const workspaces = buildKnownWorkspaces([
      testSession('a', { project: '/work/agent-app' }),
      testSession('b', { project: '/work/other' }),
    ]);
    expect(filterWorkspaces(workspaces, '').length).toBe(2);
    expect(filterWorkspaces(workspaces, '/work/agent').map((workspace) => workspace.name)).toEqual(['agent-app']);
    expect(filterWorkspaces(workspaces, 'OTHER').map((workspace) => workspace.name)).toEqual(['other']);
    expect(filterWorkspaces(workspaces, 'no-such-dir').length).toBe(0);
  });

  it('磁盘根不进候选（症状：列表出现名为「/」的目录，选中后电脑端把会话开在 /）', () => {
    const workspaces = buildKnownWorkspaces([
      testSession('rooted', { project: '/' }),
      testSession('dot', { project: '.' }),
      testSession('real', { project: '/work/agent-app' }),
    ]);
    expect(workspaces.map((workspace) => workspace.path)).toEqual(['/work/agent-app']);
  });
});