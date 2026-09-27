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
