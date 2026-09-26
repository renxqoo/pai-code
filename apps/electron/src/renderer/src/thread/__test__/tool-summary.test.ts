import { describe, expect, test } from "bun:test";

import { toolSummary } from "../tool-summary";

describe("toolSummary 文案化派生", () => {
  test("症状回归：截图式多段命令不得透出绝对路径或 shell 链，只留动作+对象", () => {
    const raw =
      'cd /Users/wrr/work/agent-app && sed -n 1,60p apps/mobile/src/features/chat/timeline-list.tsx && echo "---activi...';
    const summary = toolSummary(raw);
    expect(summary).toBe("sed timeline-list.tsx…");
    expect(summary).not.toContain("/Users/");
    expect(summary).not.toContain("&&");
    expect(summary).not.toContain("sed -n 1,60p");
  });

  test("纯文件路径退化为文件名，不露目录层级", () => {
    expect(toolSummary("/Users/wrr/work/agent-app/apps/mobile/src/strings/zh.ts")).toBe("zh.ts");
  });

  test("单命令保留动词与对象名，丢弃 flag", () => {
    expect(toolSummary("cat apps/mobile/src/strings/zh.ts")).toBe("cat zh.ts");
  });

  test("读取类参数与垃圾输入安全降级", () => {
    expect(toolSummary("src/a.ts")).toBe("a.ts");
    expect(toolSummary("   ")).toBe("");
    expect(toolSummary('"quoted name"')).toBe("quoted name");
  });
});
