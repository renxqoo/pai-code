import { describe, expect, test } from 'bun:test';
import * as React from 'react';

import type { ApiOutcome, GitGraphView } from '@paiapp/contracts';

import { useGitGraph, type GitGraphHandle } from '../use-git-graph';
import { render } from '@/testing/render';

/**
 * git 图谱拉取钩子：enabled 门（弹窗未开不请求）、cwd/revision 失效重拉、
 * 序号守卫丢过期响应、refresh 读最新 cwd。镜像 use-git-branches 的口径。
 */

const VIEW: GitGraphView = { isRepo: true, commits: [], truncated: false };
const LIST_DELAY = 10;

type ListFn = (cwd: string) => Promise<ApiOutcome<'git/graph'>>;

/** 钩子宿主（模块级：no-multi-component 禁止渲染内嵌套组件定义）。 */
type HostProps = {
  cwd: string
  revision?: number
  enabled?: boolean
  list: ListFn
  onHandle: (handle: GitGraphHandle) => void
};

function Host({ cwd, revision = 0, enabled = true, list, onHandle }: HostProps): null {
  onHandle(useGitGraph(cwd, list, revision, enabled));
  return null;
}

function harness(list: ListFn): {
  mount: (props: { cwd: string; revision?: number; enabled?: boolean }) => void
  handle: () => GitGraphHandle | null
  unmount: () => void
} {
  const box: { current: GitGraphHandle | null } = { current: null };
  /** render 句柄的本测试使用面（rerender/unmount） */
  let page: { rerender: (next: React.ReactElement) => void; unmount: () => void } | null = null;
  return {
    mount: (props) => {
      const element = <Host {...props} list={list} onHandle={(handle) => { box.current = handle; }} />;
      if (page === null) page = render(element);
      else page.rerender(element);
    },
    handle: () => box.current,
    unmount: () => page?.unmount(),
  };
}

async function flush(): Promise<void> {
  await React.act(async () => {
    for (let i = 0; i < LIST_DELAY; i += 1) await Promise.resolve();
  });
}

describe('useGitGraph', () => {
  test('enabled=false 不请求；打开（enabled）即拉取', async () => {
    const calls: string[] = [];
    const list: ListFn = (cwd) => {
      calls.push(cwd);
      return Promise.resolve({ ok: true, data: VIEW });
    };
    const h = harness(list);
    h.mount({ cwd: '/w/repo', enabled: false });
    await flush();
    expect(calls).toEqual([]);
    expect(h.handle()?.view).toBeNull();
    expect(h.handle()?.loading).toBe(false);

    h.mount({ cwd: '/w/repo', enabled: true });
    expect(h.handle()?.loading).toBe(true);
    await flush();
    expect(calls).toEqual(['/w/repo']);
    expect(h.handle()?.view).toEqual(VIEW);
    h.unmount();
  });

  test('关闭后清空本地快照：再打开重新拉取（不展示旧图谱）', async () => {
    let round = 0;
    const list: ListFn = () => {
      round += 1;
      return Promise.resolve({ ok: true, data: { isRepo: true, commits: [], truncated: false } });
    };
    const h = harness(list);
    h.mount({ cwd: '/w/repo', enabled: true });
    await flush();
    expect(round).toBe(1);
    h.mount({ cwd: '/w/repo', enabled: false });
    expect(h.handle()?.view).toBeNull();
    h.mount({ cwd: '/w/repo', enabled: true });
    await flush();
    expect(round).toBe(2);
    h.unmount();
  });

  test('cwd 变化重拉且旧响应被序号守卫丢弃（晚到的旧目录结果不覆盖新目录）', async () => {
    const list: ListFn = (cwd) => {
      if (cwd === '/w/old') {
        // 旧目录的响应晚 20ms 结算，不得覆盖已结算的新目录视图
        return new Promise((resolve) => {
          setTimeout(() => resolve({ ok: true, data: { isRepo: true, commits: [], truncated: false } }), 20);
        });
      }
      return Promise.resolve({ ok: true, data: VIEW });
    };
    const h = harness(list);
    h.mount({ cwd: '/w/old', enabled: true });
    h.mount({ cwd: '/w/new', enabled: true });
    await flush();
    expect(h.handle()?.view).toEqual(VIEW); // 新目录已结算
    await React.act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 30); // 旧响应此刻晚到
      });
    });
    await flush();
    expect(h.handle()?.view).toEqual(VIEW); // 未被旧响应覆盖
    h.unmount();
  });

  test('失败面：list 拒绝 → failed；refresh 用最新 cwd 重拉', async () => {
    const calls: string[] = [];
    const list: ListFn = (cwd) => {
      calls.push(cwd);
      return Promise.resolve(calls.length === 1 ? { ok: false, reason: 'git_failed:x' } : { ok: true, data: VIEW });
    };
    const h = harness(list);
    h.mount({ cwd: '/w/a', enabled: true });
    await flush();
    expect(h.handle()?.failed).toBe(true);
    expect(h.handle()?.view).toBeNull();

    // mount 自带 act（嵌套 act 会把 rerender 推迟到外层退出，refresh 读到旧 cwd）——分开调用
    h.mount({ cwd: '/w/b', enabled: true });
    React.act(() => {
      h.handle()?.refresh();
    });
    await flush();
    expect(calls).toEqual(['/w/a', '/w/b', '/w/b']);
    expect(h.handle()?.view).toEqual(VIEW);
    h.unmount();
  });

  test('revision 递增（checkout 成功的失效信号）→ 回到 loading 并重拉', async () => {
    const calls: string[] = [];
    const list: ListFn = (cwd) => {
      calls.push(cwd);
      return Promise.resolve({ ok: true, data: { isRepo: true, commits: [], truncated: false } });
    };
    const h = harness(list);
    h.mount({ cwd: '/w/repo', revision: 1, enabled: true });
    await flush();
    expect(h.handle()?.view).not.toBeNull();
    expect(h.handle()?.loading).toBe(false);

    h.mount({ cwd: '/w/repo', revision: 2, enabled: true });
    expect(h.handle()?.loading).toBe(true); // 失效期间回到 loading，不展示旧图谱
    expect(h.handle()?.view).toBeNull();
    await flush();
    expect(calls).toEqual(['/w/repo', '/w/repo']);
    expect(h.handle()?.view).not.toBeNull();
    h.unmount();
  });
});
