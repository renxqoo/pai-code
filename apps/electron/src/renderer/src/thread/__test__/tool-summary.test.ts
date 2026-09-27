import { describe, expect, test } from "bun:test";

import { toolSummary } from "../tool-summary";

/**
 * 命令摘要：**命令忠实展示，一行放不下才截断加省略号**（用户裁决，两次确认）。
 *
 * 唯一允许的加工是「折叠空白」与「截断加省略号」——任何内容改写（剥 flag、
 * 剥目录前缀、切命令链、剥重定向）都会让显示的不再是原命令。曾经的实现
 * 因为剥重定向，把 `cd /x && python3 - <<'EOF' …` 吃成只剩 `python3`。
 */
describe("toolSummary 命令忠实展示", () => {
  test("短命令原样：动作、参数、flag、路径全部保留", () => {
    expect(toolSummary("bun test")).toBe("bun test");
    expect(toolSummary("git status")).toBe("git status");
    expect(toolSummary("bun test --coverage")).toBe("bun test --coverage");
    expect(toolSummary("grep -rn TODO src")).toBe("grep -rn TODO src");
    expect(toolSummary("cat apps/mobile/src/strings/zh.ts")).toBe("cat apps/mobile/src/strings/zh.ts");
  });

  test("命令链原样保留（曾被切到只剩 cd 后的第一个动词）", () => {
    const cmd = "cd /Users/wrr/work/agent-app && python3 - <<'PY'\np='a.tsx'\nPY";
    expect(toolSummary(cmd)).toBe("cd /Users/wrr/work/agent-app && python3 - <<'PY' p='a.tsx' PY");
  });

  test("症状回归：heredoc 命令必须完整展示（剥重定向曾把 << 一起吃掉）", () => {
    // 用户的真实命令形态
    const cmd =
      "cd /Users/wrr/work/agent-app && python3 - <<'PY'\np='apps/electron/src/renderer/src/thread/__test__/tool-call-row.test.tsx'\ns=open(p).read()\nPY";
    const summary = toolSummary(cmd);
    expect(summary).toContain("python3");
    expect(summary).toContain("<<'PY'");
    expect(summary).not.toBe("python3");
    // 不得只剩动词
    expect(summary.split(" ").length).toBeGreaterThan(2);
  });

  test("重定向与管道原样保留（不剥——`cat > f` 就是这条命令的一部分）", () => {
    expect(toolSummary("cat > out.txt")).toBe("cat > out.txt");
    expect(toolSummary("cat a.txt >> log")).toBe("cat a.txt >> log");
    expect(toolSummary("cat f.txt | wc -l")).toBe("cat f.txt | wc -l");
  });

  test("同名不同包可区分（剥 basename 会让它们变成两行一样的文字）", () => {
    expect(toolSummary("cat packages/api/src/views/foo.ts")).not.toBe(toolSummary("cat packages/ui/src/views/foo.ts"));
  });

  test("摘要层不产省略号：截断交给 CSS truncate（用户裁决口径 A）", () => {
    // 任何 JS 字符上限都表达不了「一行放不下」：等宽下 CJK 是 ASCII 两倍宽
    expect(toolSummary("bun test")).not.toContain("…");
    expect(toolSummary("sed -n 1,60p apps/mobile/src/chat/timeline-list.tsx")).not.toContain("…");
    // 超长命令原样透出，由行内 CSS 按真实视觉宽度截断
    const long = "b".repeat(500);
    expect(toolSummary(long)).toBe(long);
    expect(toolSummary(long)).not.toContain("…");
  });

  test("多行命令折平成一行（行内不得出现换行/制表）", () => {
    const messy = "python3 - <<'PY'\nimport os\nprint('中文')\nPY";
    const summary = toolSummary(messy);
    expect(summary).not.toContain("\n");
    expect(summary).not.toContain("\t");
    // 正文确实在（忠实展示），只是被折平
    expect(summary).toContain("import os");
  });

  test("空白折叠：多余空格不撑宽行", () => {
    expect(toolSummary("bun   test    --coverage")).toBe("bun test --coverage");
    expect(toolSummary("  bun test  ")).toBe("bun test");
  });

  test("引号原样保留：引号对 shell 是语法内容（撕破它比多两个字符糟得多）", () => {
    // 症状回归：曾把 `"./lint.sh" --fix "src/**"` 剥成
    // `./lint.sh" --fix "src/**`（引号不平衡的破命令）
    expect(toolSummary('"./lint.sh" --fix "src/**"')).toBe('"./lint.sh" --fix "src/**"');
    expect(toolSummary('`git status`')).toBe("`git status`");
    expect(toolSummary('"quoted task description"')).toBe('"quoted task description"');
  });

  test("垃圾输入安全降级", () => {
    expect(toolSummary("")).toBe("");
    expect(toolSummary("   ")).toBe("");
  });
});
