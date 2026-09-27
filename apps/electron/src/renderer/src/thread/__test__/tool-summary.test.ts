import { describe, expect, test } from "bun:test";

import { toolSummary } from "../tool-summary";

describe("toolSummary 文案化派生", () => {
  test("症状回归：截图式多段命令不得透出绝对路径或 shell 链，只留动作+对象", () => {
    const raw =
      'cd /Users/wrr/work/agent-app && sed -n 1,60p apps/mobile/src/features/chat/timeline-list.tsx && echo "---activi...';
    const summary = toolSummary(raw);
    // 不补省略号（用户裁决 2）：摘要已吃满整行宽度，再画「…」读成内容被截断
    expect(summary).toBe("sed timeline-list.tsx");
    expect(summary).not.toContain("…");
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

  test("症状回归：整段脚本参数不得当对象名透出（bash -c 里的中文笔记曾占满整行）", () => {
    const script = `bash -c "# 失败的 stdout 段在哪（失败原因正文）一看完整文件头部 head x-y… # macos 那个：JSON 结构对但 schema \\"scores\\" 是模型自创结构"`;
    const summary = toolSummary(script);
    expect(summary).toBe("bash");
    // 不得含任何 CJK 正文碎片
    expect(summary).not.toMatch(/[一-鿿]/);
  });

  test("node -e / python -c 同口径：脚本内容不进摘要", () => {
    expect(toolSummary('node -e "console.log(1)"')).toBe("node");
    expect(toolSummary('python -c "print(1)"')).toBe("python");
  });

  test("判据是「动词+flag」组合：sed -e 这类只吃短参的 flag 不误伤", () => {
    expect(toolSummary("sed -e s/a/b/ a.tsx")).toBe("sed a.tsx");
  });

  test("对象位丢弃散文碎片（长句/标点/CJK），保留文件名与包名", () => {
    expect(toolSummary("grep 这是中文说明 report.md")).toBe("grep report.md");
    expect(toolSummary("bun test")).toBe("bun test");
    expect(toolSummary("npm run lint")).toBe("npm run lint");
  });

  test("剥目录前缀在前、噪声判定在后（长路径归一后不得被当噪声丢掉）", () => {
    expect(toolSummary("sed -n 1,60p apps/mobile/src/features/chat/timeline-list.tsx")).toBe("sed timeline-list.tsx");
    expect(toolSummary("cat /Users/wrr/work/agent-app/apps/strings/zh.ts")).toBe("cat zh.ts");
  });
});

/**
 * 命令摘要的展示面回归网（用户反馈驱动）：
 * 每一行都是真机上出现过的命令形态，逐条钉住「行内显示什么」。
 * 判据是语义（动作 + 对象名），不是 class——class 断言在重构时会假红。
 */
describe("toolSummary 命令形态全覆盖（真机走查逐条）", () => {
  test.each([
    // 简单形态：动作 + 对象原样
    ["bun test", "bun test"],
    ["git status", "git status"],
    ["ls src", "ls src"],
    ["grep TODO src", "grep TODO src"],
    ["npm run lint", "npm run lint"],
    ["bun run build --filter x", "bun run build x"],
    // 短文件名
    ["sed -n 1,20p a.ts", "sed a.ts"],
    ["cat zh.ts", "cat zh.ts"],
    ["wc -l src/a.ts", "wc a.ts"],
    // 长文件名（症状回归：.{28,} 散文判据曾把它们全滤光）
    [
      "cd /Users/wrr/work/agent-app && sed -n 44,56p packages/api/src/views/__test__/entries-mapper-edit-hunks.test.ts",
      "sed entries-mapper-edit-hunks.test.ts",
    ],
    [
      "sed -n 1,5p apps/electron/src/renderer/src/thread/thread-model.ts",
      "sed thread-model.ts",
    ],
    // cd 跳过：取首个实质段
    ["cd /Users/x/repo && npm run lint", "npm run lint"],
    ["cd /a && cd /b && bun test", "bun test"],
    ["export FOO=1 && bun test", "bun test"],
    // 重定向 / 管道分段
    ["bun test | tee out.log", "bun test"],
    ["cat file.txt && wc -l file.txt", "cat file.txt"],
    ["bun test; bun run lint", "bun test"],
    // heredoc：正文不得泄进摘要
    ["python3 - <<'EOF'\nimport pathlib\np = pathlib.Path('server.mjs')\nEOF", "python3"],
    ["node - <<EOF\nconst x = 1\nEOF", "node"],
    ["cat > /tmp/x.md <<EOF\n# 标题\n正文\nEOF", "cat"],
    // 整段脚本：内容不进摘要
    ['bash -c "一大段中文说明"', "bash"],
    ['node -e "console.log(1)"', "node"],
    ['python3 -c "print(1)"', "python3"],
    // flag 不误伤：sed -e 只吃短参
    ["sed -e s/a/b/ a.tsx", "sed a.tsx"],
    // 垃圾与边界
    ["", ""],
    ["   ", ""],
    ['"quoted task description"', "quoted task description"],
  ] as ReadonlyArray<readonly [string, string]>)("%s", (input, want) => {
    expect(toolSummary(input)).toBe(want);
  });

  test("绝不泄出：绝对路径 / shell 运算符 / 省略号 / 完整命令串", () => {
    const nasty = [
      "cd /Users/wrr/work/benchmark/dashboard && python3 - <<'EOF'\nimport pathlib\nEOF",
      "git commit -m 'fix: 修复渲染' && git push",
      "cd /a && sed -n 1,60p b/c/d.tsx && echo '---done'",
    ];
    for (const raw of nasty) {
      const summary = toolSummary(raw);
      expect(summary).not.toContain("/Users/");
      expect(summary).not.toContain("&&");
      expect(summary).not.toContain("…");
      expect(summary.length).toBeLessThanOrEqual(60);
      expect(summary).not.toMatch(/[一-鿿]/);
    }
  });

  test("摘要恒为一行：无换行、无制表", () => {
    const messy = "echo 'line1\nline2\ttabbed'";
    const summary = toolSummary(messy);
    expect(summary).not.toContain("\n");
    expect(summary).not.toContain("\t");
  });
});
