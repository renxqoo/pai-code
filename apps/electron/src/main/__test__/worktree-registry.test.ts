import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorktreeRegistry, gcData, withTree, withoutTree, type WorktreeRegistryData } from '../worktree-registry';

const base: WorktreeRegistryData = { dirs: [], treeToRepoTop: {}, sessionTrees: {} };

describe('worktree registry 三张表（§1.6）', () => {
  test('withTree：白名单去重 + repoTop 映射 + sessionTrees last-wins', () => {
    let data = withTree(base, { path: '/w/t1', repoTop: '/w/repo', sessionThreadId: 's1' });
    data = withTree(data, { path: '/w/t1', repoTop: '/w/repo' });
    data = withTree(data, { path: '/w/t2', repoTop: '/w/repo', sessionThreadId: 's1' });
    expect(data.dirs).toEqual(['/w/t1', '/w/t2']);
    expect(data.treeToRepoTop['/w/t1']).toBe('/w/repo');
    expect(data.sessionTrees.s1).toBe('/w/t2'); // last-wins：同会话二次建树覆盖
  });

  test('withoutTree：三表联清（chip/映射/白名单一并消失）', () => {
    let data = withTree(base, { path: '/w/t1', repoTop: '/w/repo', sessionThreadId: 's1' });
    data = withoutTree(data, '/w/t1');
    expect(data.dirs).toEqual([]);
    expect(data.treeToRepoTop['/w/t1']).toBeUndefined();
    expect(data.sessionTrees.s1).toBeUndefined();
  });

  test('gcData：树目录缺席的条目剔除（防死路径 chip）', () => {
    let data = withTree(base, { path: '/w/alive', repoTop: '/w/repo', sessionThreadId: 's1' });
    data = withTree(data, { path: '/w/gone', repoTop: '/w/repo', sessionThreadId: 's2' });
    const kept = gcData(data, (p) => p === '/w/alive');
    expect(kept.dirs).toEqual(['/w/alive']);
    expect(kept.treeToRepoTop['/w/gone']).toBeUndefined();
    expect(kept.sessionTrees.s2).toBeUndefined();
    expect(kept.sessionTrees.s1).toBe('/w/alive');
  });

  test('持久化 round-trip：add → 新实例 read；remove → 消失；坏 JSON → 空形态降级', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xh-reg-'));
    const file = join(dir, 'reg.json');
    const reg = createWorktreeRegistry(file);
    reg.addTree({ path: '/w/t1', repoTop: '/w/repo', sessionThreadId: 's1' });
    const reloaded = createWorktreeRegistry(file).read();
    expect(reloaded.dirs).toEqual(['/w/t1']);
    expect(reloaded.sessionTrees.s1).toBe('/w/t1');
    createWorktreeRegistry(file).removeTree('/w/t1');
    expect(createWorktreeRegistry(file).read().dirs).toEqual([]);
    writeFileSync(file, '{broken');
    expect(createWorktreeRegistry(file).read().dirs).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });
});
