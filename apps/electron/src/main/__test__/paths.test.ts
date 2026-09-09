import { describe, expect, test } from "bun:test";

import { resolveAppPaths, resolveUserDataDir } from "../paths";

describe("resolveUserDataDir（缺省 ~/.pai，PAI_USER_DATA_DIR 隔离覆盖）", () => {
  test("未设置 env → home 下 .pai", () => {
    expect(resolveUserDataDir({}, "/home/u")).toBe("/home/u/.pai");
  });

  test('env 为空串视为未设置（避免 PAI_USER_DATA_DIR="" 把数据根清成空路径）', () => {
    expect(resolveUserDataDir({ PAI_USER_DATA_DIR: "" }, "/home/u")).toBe("/home/u/.pai");
  });

  test("env 非空 → 整体重定向（worktree 并行实例独立数据区）", () => {
    expect(resolveUserDataDir({ PAI_USER_DATA_DIR: "/tmp/wt-user-data" }, "/home/u")).toBe(
      "/tmp/wt-user-data",
    );
  });
});

describe("resolveAppPaths（userData 落盘布局）", () => {
  test("全部子路径落在 userData 根下", () => {
    expect(resolveAppPaths("/home/u/.pai")).toEqual({
      userDataDir: "/home/u/.pai",
      agentDir: "/home/u/.pai/agent",
      registryDb: "/home/u/.pai/registry.sqlite",
      settingsFile: "/home/u/.pai/settings.json",
      providerKeysFile: "/home/u/.pai/provider-keys.json",
      logFile: "/home/u/.pai/main.log",
    });
  });
});
