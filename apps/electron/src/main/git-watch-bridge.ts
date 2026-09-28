// git 分支失效本地兜底（docs/GIT-INTERACTION-REDESIGN §2.3/D1'）：主进程对活跃 cwd
// 的 gitdir 建 fs.watch（渲染层无 fs 能力——落主进程）；变更 → 300ms 防抖 → 广播
// gitChanged UiEvent（与 hub git/changed 事件同型——渲染层单一消费面）。hub 事件为主
// 加速（live 会话 ≤1s），本地 watch 兜 parked/打开态与 hub 事件丢失。
//
// 生命周期：渲染层经 ipc 声明关注 cwd 集合（会话激活/面板打开时 add，离开 remove——
// 期望集合语义与 hub 侧 reconcile 同构）；1s 对账拍不另设（集合即声明面，无表可查）。

import { watch, type FSWatcher } from 'node:fs';
import type { UiEvent } from '@paiapp/contracts';

export interface GitWatchBridge {
  /** 声明关注 cwd（幂等；非 git 目录静默无锚） */
  watchCwd: (cwd: string) => void
  unwatchCwd: (cwd: string) => void
  dispose: () => void
}

const DEBOUNCE_MS = 300;

interface Anchor {
  readonly gitDir: string
  readonly watchers: FSWatcher[]
  refCount: number
  timer: ReturnType<typeof setTimeout> | undefined
}

/** 渲染层声明驱动的 gitdir watch 桥（gitdir 定位复用 git/branches 已读值——调用方传入） */
export function createGitWatchBridge(emit: (event: UiEvent) => void, gitDirOf: (cwd: string) => string | null): GitWatchBridge {
  const anchors = new Map<string, Anchor>(); // gitDir → 锚
  const cwds = new Map<string, string>(); // cwd → gitDir（声明面）

  const fire = (gitDir: string): void => {
    const anchor = anchors.get(gitDir);
    if (anchor === undefined) return;
    if (anchor.timer !== undefined) clearTimeout(anchor.timer);
    anchor.timer = setTimeout(() => {
      anchor.timer = undefined;
      // 逐声明 cwd 广播（与 hub 事件 fan-out 同型：threadId 域由渲染层会话匹配替代——
      // 桥不知 threadId，用 cwd 匹配的 gitChanged 形态，threadId 填 cwd 对应占位）
      for (const [cwd, dir] of cwds) {
        if (dir === gitDir) emit({ type: 'gitChanged', threadId: cwd, cwd });
      }
    }, DEBOUNCE_MS);
  };

  const open = (gitDir: string): void => {
    if (anchors.has(gitDir)) return;
    const watchers: FSWatcher[] = [];
    try {
      const w = watch(gitDir, { persistent: false }, () => fire(gitDir));
      w.on('error', () => {
        close(gitDir); // 树删/权限：关锚（下次声明重开——声明驱动的重挂语义）
      });
      watchers.push(w);
      anchors.set(gitDir, { gitDir, watchers, refCount: 0, timer: undefined });
    } catch {
      // gitdir 不可 watch（不存在等）：不建锚（声明保留——unwatch 时清）
    }
  };

  const close = (gitDir: string): void => {
    const anchor = anchors.get(gitDir);
    if (anchor === undefined) return;
    if (anchor.timer !== undefined) clearTimeout(anchor.timer);
    for (const w of anchor.watchers) w.close();
    anchors.delete(gitDir);
  };

  return {
    watchCwd(cwd: string): void {
      if (cwds.has(cwd)) return;
      const gitDir = gitDirOf(cwd);
      if (gitDir === null) return; // 非 git/不可判——不锚（gitDirOf 缓存语义归调用方）
      cwds.set(cwd, gitDir);
      const anchor = anchors.get(gitDir);
      if (anchor !== undefined) {
        anchor.refCount += 1;
        return;
      }
      open(gitDir);
      const fresh = anchors.get(gitDir);
      if (fresh !== undefined) fresh.refCount = 1;
    },
    unwatchCwd(cwd: string): void {
      const gitDir = cwds.get(cwd);
      if (gitDir === undefined) return;
      cwds.delete(cwd);
      const stillUsed = [...cwds.values()].some((dir) => dir === gitDir);
      if (!stillUsed) close(gitDir); // 引用归零收锚（无泄漏红线）
    },
    dispose(): void {
      for (const gitDir of [...anchors.keys()]) close(gitDir);
      cwds.clear();
    },
  };
}
