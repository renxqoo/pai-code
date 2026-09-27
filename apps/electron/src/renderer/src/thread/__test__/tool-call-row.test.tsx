import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ToolCallRow } from "../tool-call-row";
import type { ToolCallModel } from "../thread-model";

/** task 工具调用的行样式锚点：标签段、agent 名段（蓝色等宽）、描述段一次齐备。 */
const SPAWN = { agent: "Explore", task: "分析 host-hub sandbox 现状" };

function call(overrides: Partial<ToolCallModel>): ToolCallModel {
  return {
    id: "c1",
    name: "task",
    argsPreview: "Explore",
    subagents: [SPAWN],
    editHunks: [],
    output: "",
    exitCode: null,
    durationMs: null,
    status: "running",
    ...overrides,
  };
}

function renderRow(model: ToolCallModel): string {
  return renderToStaticMarkup(<ToolCallRow call={model} />);
}

describe("ToolCallRow 子智能体执行行（参考图样式）", () => {
  test("单 spawn 行：状态前缀 + 蓝色等宽 agent 名 + · 任务描述三段齐备", () => {
    const html = renderRow(call({ status: "running" }));
    expect(html).toContain("正在派生子智能体");
    expect(html).toContain("Explore");
    expect(html).toContain("·");
    expect(html).toContain("分析 host-hub sandbox 现状");
    // 运行中整行走 shimmer（全应用执行中语言），落定后 agent 名显蓝色等宽
    expect(html).toContain("font-mono");
    const settled = renderRow(call({ status: "ok", durationMs: 1200 }));
    expect(settled).toContain("已派生子智能体");
    expect(settled).toContain("text-link");
  });

  test("多 spawn 一行一项：行数随清单展开（用户裁决 2：成功行不再挂耗时）", () => {
    const html = renderRow(
      call({
        status: "ok",
        durationMs: 4200,
        subagents: [
          SPAWN,
          { agent: "general-purpose", task: "调研业界沙箱审批设计" },
        ],
      }),
    );
    expect(html).toContain("Explore");
    expect(html).toContain("general-purpose");
    expect(html).toContain("调研业界沙箱审批设计");
    // 成功态不显耗时（行尾只留失败退出码/停止态）
    expect(html).not.toContain("tabular-nums");
  });

  test("失败行仍显退出码（耗时退役不等于状态信息也去掉）", () => {
    const html = renderRow(call({ status: "failed", exitCode: 2, durationMs: 4200 }));
    expect(html).toContain("退出码 2");
  });

  test("展开态：有输出时可展开（aria-expanded），详情含输出", () => {
    const html = renderRow(call({ status: "failed", exitCode: 1, output: "boom" }));
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("boom");
  });

  test("行尾退出码：失败行尾显退出码标签", () => {
    const html = renderRow(call({ status: "failed", exitCode: 1 }));
    expect(html).toContain("退出码 1");
  });

  test("行文本弱化灰（用户裁决 3：工具执行行灰色），不挂打勾/叉状态图标", () => {
    const html = renderRow(call({ name: "bash", argsPreview: "git status", subagents: [], status: "ok" }));
    expect(html).toContain("text-muted-foreground");
    expect(html).not.toContain("text-foreground/75");
    expect(html).not.toContain("lucide-check");
    expect(html).not.toContain("lucide-x");
  });

  test("症状回归：展开箭头紧跟文案（gap 6px），不得被推到行尾", () => {
    const html = renderRow(call({ name: "bash", argsPreview: "bun test", subagents: [], status: "ok", output: "hi" }));
    expect(html).not.toContain("ml-auto");
    // 摘要 span 不得 flex-1 撑满——那会把行尾元素（箭头）全推到右缘。
    // （按钮容器上的 flex-1 是点击区，正确）
    const summary = html.match(/<span title="[^"]*" class="([^"]*)"/)?.[1] ?? "";
    expect(summary).toContain("min-w-0 shrink break-words");
    expect(summary).not.toContain("flex-1");
  });

  test("行内箭头收起态 hover 才显形（用户裁决 2）", () => {
    const closed = renderRow(call({ status: "ok", output: "hi" }));
    expect(closed).toContain("opacity-0");
    expect(closed).toContain("group-hover:opacity-70");
    expect(closed).toContain("group");
  });

  test("参数摘要自适应铺满：不吃 truncate、不吃固定上限（用户裁决 1：省掉省略号）", () => {
    const html = renderRow(call({ name: "bash", argsPreview: "bun run build", subagents: [], status: "ok" }));
    expect(html).toContain("flex-1");
    expect(html).toContain("break-words");
    expect(html).not.toContain("max-w-full");
    expect(html).not.toContain("truncate");
  });

  test("症状回归：运行中图标不得消失——shimmer 是 background-clip:text 文字技法，\n     作用在 SVG 上会因 color:transparent + stroke=currentColor 让描边不可见", () => {
    const running = renderRow(call({ name: "bash", argsPreview: "bun test", subagents: [], status: "running" }));
    // 图标元素恒在，且不带 shimmer
    const icon = running.match(/<svg[^>]*class="([^"]*)"/)?.[1] ?? "";
    expect(icon).not.toBe("");
    expect(icon).not.toContain("shimmer-text");
    expect(icon).toContain("text-muted-foreground");
    // 文案仍然跑 shimmer（运行态由文字承载）
    expect(running).toContain("shimmer-text");
  });

  test("行尾停止态：已停止标签", () => {
    const html = renderRow(call({ status: "stopped" }));
    expect(html).toContain("已停止");
  });

  test("agent 缺失只显任务描述（垃圾参数空形态降级，不悬挂分隔点）", () => {
    const html = renderRow(call({ subagents: [{ agent: "", task: "分析现状" }] }));
    expect(html).toContain("分析现状");
    expect(html).toContain("正在派生子智能体");
    expect(html).not.toContain(">·</span>");
  });

  test("task 描述缺失：占位弹性段撑住行尾对齐，不显分隔点", () => {
    const html = renderRow(call({ subagents: [{ agent: "Explore", task: "" }] }));
    expect(html).toContain("Explore");
    expect(html).not.toContain(">·</span>");
  });
});

describe("ToolCallRow 状态前缀（用户裁决 3：每条执行带上「已…」）", () => {
  test.each([
    ["bash 行命令本体", "bash", "git status", "已运行", "lucide-square-terminal"],
    ["read", "read", "src/a.ts", "已阅读", "lucide-book-open"],
    ["edit", "edit", "src/a.ts", "已编辑", "lucide-pencil"],
    ["write", "write", "src/a.ts", "已写入", "lucide-pencil"],
    ["grep 归搜索", "grep", "TODO", "已搜索", "lucide-wrench"],
    ["ls 归列目录", "ls", "src", "已列出", "lucide-wrench"],
  ])("其他工具 %s：已完成前缀 + 类别图标 + 参数摘要", (_name, tool, preview, label, icon) => {
    const html = renderRow(call({ name: tool, argsPreview: preview, subagents: [], status: "ok" }));
    expect(html).toContain(label);
    expect(html).toContain(preview);
    expect(html).toContain(icon);
    expect(html).not.toContain("子智能体");
    expect(html).not.toContain("text-link");
  });

  test("运行中：前缀切进行时（状态写进动词）", () => {
    expect(renderRow(call({ name: "bash", argsPreview: "ls", subagents: [], status: "running" }))).toContain(
      "正在运行",
    );
    expect(renderRow(call({ name: "read", argsPreview: "a.ts", subagents: [], status: "running" }))).toContain(
      "正在阅读",
    );
  });

  test("失败与停止也是过去式（发生过的事，不改时态）", () => {
    expect(renderRow(call({ name: "bash", argsPreview: "ls", subagents: [], status: "failed", exitCode: 2 }))).toContain(
      "已运行",
    );
    expect(renderRow(call({ name: "bash", argsPreview: "ls", subagents: [], status: "stopped" }))).toContain("已运行");
  });

  test("未知工具不翻译：前缀直接点名工具", () => {
    const html = renderRow(call({ name: "mcp__x__y", argsPreview: "z", subagents: [], status: "ok" }));
    expect(html).toContain("已调用mcp__x__y");
  });

  test("subagents 为空的 task 调用回退 argsPreview 单行", () => {
    const html = renderRow(call({ subagents: [] }));
    expect(html).toContain("正在派生子智能体");
    expect(html).toContain("Explore");
    expect(html).not.toContain("text-link");
  });
});
