import { describe, expect, test } from "bun:test";

import { toolSummary } from "../tool-summary";

/**
 * 命令摘要：**命令忠实展示，一行放不下才截断加省略号**（用户裁决）。
 *
 * 曾经的「剥 flag / 剥目录前缀 / 丢脚本正文」被推翻——那让显示的不再是
 * 原命令：`bun test` 与 `bun test --coverage` 是两回事，同名文件在不同包下
 * 也是两个文件。现在只做两件事：切命令链、截断。
 */
describe("toolSummary 命令忠实展示", () => {
  test("短命令原样：动作、参数、flag 全部保留", () => {
    expect(toolSummary("bun test")).toBe("bun test");
    expect(toolSummary("git status")).toBe("git status");
    expect(toolSummary("npm run lint")).toBe("npm run lint");
    // flag 不再被剥——它决定命令的行为
    expect(toolSummary("bun test --coverage")).toBe("bun test --coverage");
    expect(toolSummary("grep -rn TODO src")).toBe("grep -rn TODO src");
  });

  test("路径原样保留（不再退化成 basename）", () => {
    expect(toolSummary("cat apps/mobile/src/strings/zh.ts")).toBe("cat apps/mobile/src/strings/zh.ts");
    expect(toolSummary("sed -n 1,60p apps/mobile/src/features/chat/timeline-list.tsx")).toBe(
      "sed -n 1,60p apps/mobile/src/features/chat/timeline-list.tsx",
    );
    // 同名不同包现在可区分
    expect(toolSummary("cat packages/api/src/views/foo.ts")).not.toBe(toolSummary("cat packages/ui/src/views/foo.ts"));
  });

  test("命令链取首个实质段（跳过 cd/export/set）", () => {
    expect(toolSummary("cd /Users/wrr/work/agent-app && sed -n 1,20p a.ts")).toBe("sed -n 1,20p a.ts");
    expect(toolSummary("export FOO=1 && bun test")).toBe("bun test");
    expect(toolSummary("cd /a && cd /b && bun test")).toBe("bun test");
  });

  test("管道与分号取第一段", () => {
    expect(toolSummary("cat f.txt | wc -l")).toBe("cat f.txt");
    expect(toolSummary("bun test; bun run lint")).toBe("bun test");
  });

  test("重定向剥掉（`cat > f` 展示 `cat f`——写文件不是这行在做的事）", () => {
    expect(toolSummary("cat > out.txt")).toBe("cat");
    expect(toolSummary("cat a.txt >> log")).toBe("cat a.txt");
  });

  test("超长命令：截断加省略号，且截在词边界（不把文件名劈两半）", () => {
    const long = [
      "sed -n 1,60p",
      "apps/electron/src/renderer/src/thread/__test__/tool-call-row-interactive.test.tsx",
      "apps/electron/src/renderer/src/live/__test__/convergence-reload.test.tsx",
    ].join(" ");
    const summary = toolSummary(long);
    expect(summary.endsWith("…")).toBe(true);
    expect(summary.length).toBeLessThanOrEqual(120);
    expect(summary).not.toContain("/Users/");
    // 截在词边界：省略号前是完整词，不该有半个文件名
    const head = summary.slice(0, -1);
    expect(head).toBe(head.replace(/\s+$/, ""));
    expect(long.startsWith(head)).toBe(true);
    // 补上省略号后仍是被截命令的前缀
    expect(`${head}…`.length).toBeLessThanOrEqual(120);
  });

  test("heredoc：只显动作（没有目标文件），正文绝不泄进摘要", () => {
    // 正文可能含路径、代码、中文——一律不得进摘要
    expect(toolSummary("python3 - <<'PY'\np='apps/x.tsx'\ns=open(p).read()\nPY")).toBe("python3");
    // 忠实展示：脚本内容原样带出（超长时截断），这是「不改写命令」的代价
    expect(toolSummary('node -e "console.log(1)"')).toBe('node -e "console.log(1)"');
    // 超长脚本截断加省略号，不整段铺满
    const script = toolSummary(`bash -c "${'x'.repeat(200)}"`);
    expect(script.endsWith("…")).toBe(true);
    expect(script.length).toBeLessThanOrEqual(121);
    // 有目标文件时该完整显示
    expect(toolSummary("python3 /tmp/fix.py")).toBe("python3 /tmp/fix.py");
  });

  test("多行命令折平成一行（行内不得出现换行/制表）", () => {
    const messy = "python3 - <<'PY'\nimport os\nprint('中文')\nPY";
    const summary = toolSummary(messy);
    expect(summary).not.toContain("\n");
    expect(summary).not.toContain("\t");
  });

  test("空白折叠：多余空格不撑宽行", () => {
    expect(toolSummary("bun   test    --coverage")).toBe("bun test --coverage");
    expect(toolSummary("  bun test  ")).toBe("bun test");
  });

  test("整段引号短语（任务描述）原样保留", () => {
    expect(toolSummary('"quoted task description"')).toBe("quoted task description");
  });

  test("垃圾输入安全降级", () => {
    expect(toolSummary("")).toBe("");
    expect(toolSummary("   ")).toBe("");
    expect(toolSummary("&&")).toBe("");
  });
});
