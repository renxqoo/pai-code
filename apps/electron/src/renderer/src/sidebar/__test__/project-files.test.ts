import { afterEach, describe, expect, test } from 'bun:test';

import { closeProjectFiles, installProjectFilesLister, openProjectFiles } from '../project-files';
import { workspaceActions } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';

/** 代次防竞态行为规格（旧 useProjectFiles 同构迁移，首次入测）。 */

/** 可控异步源：按 cwd 记挂起 resolver——连续 open 时可定向 resolve 任意一次请求（含迟到的旧响应）。 */
function controlledLister(): {
  resolve: (cwd: string, paths: string[] | null) => void
  lister: (cwd: string) => Promise<string[] | null>
} {
  const pendings = new Map<string, (paths: string[] | null) => void>();
  const lister = (cwd: string): Promise<string[] | null> =>
    new Promise((resolve) => {
      pendings.set(cwd, resolve);
    });
  return { lister, resolve: (cwd, paths) => pendings.get(cwd)?.(paths) };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  // 生产单例与默认 lister 复位：断言失败的用例不得把污染泄漏给同进程后续用例
  uiStore.getState().reset();
  installProjectFilesLister((cwd) => workspaceActions.listProjectFiles(cwd));
});

describe('project-files 控制器', () => {
  test('打开：目标+加载态即刻就位，响应到达落树停载', async () => {
    const seed = controlledLister();
    installProjectFilesLister(seed.lister);
    openProjectFiles('/tmp/pai', 'pai');
    expect(uiStore.getState().projectFiles).toEqual({ target: { name: 'pai', path: '/tmp/pai' }, tree: [], loading: true });
    seed.resolve('/tmp/pai', ['src/a.ts', 'src/b.ts', 'README.md']);
    await flushMicrotasks();
    const state = uiStore.getState().projectFiles;
    expect(state.loading).toBe(false);
    expect(state.tree.length).toBeGreaterThan(0);
  });

  test('代次防竞态：迟到的旧项目响应不得覆盖新目标', async () => {
    const seed = controlledLister();
    installProjectFilesLister(seed.lister);
    openProjectFiles('/tmp/old', 'old');
    // 第二次打开使第一次的代次过期，但旧 promise 尚未 resolve
    openProjectFiles('/tmp/new', 'new');
    seed.resolve('/tmp/old', ['old-file.ts']);
    await flushMicrotasks();
    const state = uiStore.getState().projectFiles;
    expect(state.target).toEqual({ name: 'new', path: '/tmp/new' });
    expect(state.loading).toBe(true);
    expect(state.tree).toEqual([]);
  });

  test('listProjectFiles 失败/空（null）：空树降级不崩溃，加载态收敛', async () => {
    installProjectFilesLister(() => Promise.resolve(null));
    openProjectFiles('/tmp/pai', 'pai');
    await flushMicrotasks();
    expect(uiStore.getState().projectFiles).toEqual({ target: { name: 'pai', path: '/tmp/pai' }, tree: [], loading: false });
  });

  test('close 即复位；关闭后到达的旧响应无害（target 保持 null）', async () => {
    const seed = controlledLister();
    installProjectFilesLister(seed.lister);
    openProjectFiles('/tmp/pai', 'pai');
    closeProjectFiles();
    expect(uiStore.getState().projectFiles.target).toBe(null);
    seed.resolve('/tmp/pai', ['late.ts']);
    await flushMicrotasks();
    const state = uiStore.getState().projectFiles;
    expect(state.target).toBe(null);
    expect(state.loading).toBe(false);
  });
});
