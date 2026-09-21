import { describe, expect, test } from "bun:test";

import { createGitBranches, type GitExec, type GitExecResult } from "../git-branches";

/**
 * 红测：git 分支列表与 checkout 不串行 → 撕裂快照 / 别名 cwd 失效盲区
 * （packages/api/src/verbs/git-branches.ts）。
 *
 * 声称的 Bug 1（撕裂快照）：checkout 只与 checkout 全局串行，list 的四连读
 * （rev-parse → for-each-ref → symbolic-ref → status）与 checkout 完全并发。
 * 一次跨在 checkout 两侧的 list 会输出「current 来自新世代、branches 来自旧世代」
 * 的内部不一致快照——UI 显示当前分支不在分支列表里。
 *
 * 声称的 Bug 2（失效按 cwd 原始字符串键控）：checkout 成功后只失效同一 cwd
 * 字符串的在途 list；同一仓库经别名（符号链接/尾斜杠）发起的 list 复用切换前
 * 的在途快照——注释宣称已修复的「界面停在旧分支」经别名复活。
 *
 * 期望（修复后的世界）：任一时刻返回给 UI 的快照内部一致
 * （current ∈ branches），且 checkout 后同仓库（无论 cwd 词形）的刷新
 * 不再命中切换前的快照。当前实现下两条断言均失败（红）。
 */

const ok = (stdout: string): GitExecResult => ({ code: 0, stdout, stderr: "", error: null });

interface RepoState {
  branches: string[];
  head: string;
  status: string;
}

function makeExecutor(state: RepoState, gateStore: { gate: PromiseWithResolvers<void> | null; target: string; consumed: boolean }): GitExec {
  return async (args) => {
    const sub = args[0] ?? "";
    if (sub === "rev-parse") return ok("");
    if (sub === "for-each-ref") {
      // 子进程输出在命令执行时刻即确定（gate 只建模管道送达延迟，不建模重读状态）
      const out = state.branches.join("\n");
      if (gateStore.target === "for-each-ref" && !gateStore.consumed) {
        gateStore.consumed = true;
        await gateStore.gate?.promise;
      }
      return ok(out);
    }
    if (sub === "symbolic-ref") return ok(state.head);
    if (sub === "status") {
      const out = state.status;
      if (gateStore.target === "status" && !gateStore.consumed) {
        gateStore.consumed = true;
        await gateStore.gate?.promise;
      }
      return ok(out);
    }
    if (sub === "checkout") {
      const branch = args[1] === "-b" ? args[2] ?? "" : args[1] ?? "";
      state.head = branch;
      if (args[1] === "-b") state.branches = [...state.branches, branch];
      return ok(`Switched to branch '${branch}'`);
    }
    return ok("");
  };
}

const tick = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};

describe("createGitBranches 列表读的一致性", () => {
  test("list 跨在 checkout 两侧时快照必须内部一致（current ∈ branches）", async () => {
    const state: RepoState = { branches: ["main"], head: "main", status: "" };
    const gateStore: { gate: PromiseWithResolvers<void> | null; target: string; consumed: boolean } = {
      gate: Promise.withResolvers<void>(),
      target: "for-each-ref",
      consumed: false,
    };
    const branches = createGitBranches(makeExecutor(state, gateStore));

    // list 先行，挂在 for-each-ref（旧世代：branches=[main]）
    const listPromise = branches.list("/repo");
    await tick();

    // checkout 并发完成（新世代：新建并切到 feature）
    const checkoutOutcome = await branches.checkout("/repo", "feature", true);
    expect(checkoutOutcome.ok).toBe(true);

    // 放行 list：symbolic-ref/status 读到的是切换后的世代
    gateStore.gate?.resolve();
    const listOutcome = await listPromise;
    expect(listOutcome.ok).toBe(true);
    if (!listOutcome.ok) return;

    // UI 不变式：当前分支必须出现在分支列表中
    expect(listOutcome.data.branches).toContain(listOutcome.data.current ?? "");
  });

  test("checkout 后同仓库别名 cwd 的刷新不得复用切换前的在途快照", async () => {
    const state: RepoState = { branches: ["main"], head: "main", status: "" };
    const gateStore: { gate: PromiseWithResolvers<void> | null; target: string; consumed: boolean } = {
      gate: Promise.withResolvers<void>(),
      target: "status",
      consumed: false,
    };
    const branches = createGitBranches(makeExecutor(state, gateStore));

    // UI 经别名 A 发起 list，读分支与 HEAD 后挂在 status（旧世代：head=main）
    const staleList = branches.list("/tmp/proj");
    await tick();

    // 用户经别名 B（符号链接真身）切换到 feature
    const checkoutOutcome = await branches.checkout("/private/tmp/proj", "feature", true);
    expect(checkoutOutcome.ok).toBe(true);

    // UI 在别名 A 上刷新——命中仍在途的切换前快照
    const refresh = branches.list("/tmp/proj");
    gateStore.gate?.resolve();
    const refreshed = await refresh;
    await staleList;

    expect(refreshed.ok).toBe(true);
    if (!refreshed.ok) return;
    expect(refreshed.data.current).toBe("feature");
  });
});
