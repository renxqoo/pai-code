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
  test("单 spawn 行：标签 + 蓝色等宽 agent 名 + · 任务描述三段齐备", () => {
    const html = renderRow(call({ status: "running" }));
    expect(html).toContain("子智能体");
    expect(html).toContain("Explore");
    expect(html).toContain("·");
    expect(html).toContain("分析 host-hub sandbox 现状");
    // 运行中整行走 shimmer（全应用执行中语言），落定后 agent 名显蓝色等宽
    expect(html).toContain("font-mono");
    const settled = renderRow(call({ status: "ok", durationMs: 1200 }));
    expect(settled).toContain("text-link");
  });

  test("多 spawn 一行一项：行数随清单展开，行尾耗时只挂最后一行", () => {
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
    // 行尾耗时标签恰好一次（最后一行），不随 spawn 数翻倍
    expect(html.split("tabular-nums")).toHaveLength(2);
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

  test("行尾停止态：已停止标签", () => {
    const html = renderRow(call({ status: "stopped" }));
    expect(html).toContain("已停止");
  });

  test("agent 缺失只显任务描述（垃圾参数空形态降级，不悬挂分隔点）", () => {
    const html = renderRow(call({ subagents: [{ agent: "", task: "分析现状" }] }));
    expect(html).toContain("分析现状");
    expect(html).toContain("子智能体");
    expect(html).not.toContain(">·</span>");
  });

  test("task 描述缺失：占位弹性段撑住行尾对齐，不显分隔点", () => {
    const html = renderRow(call({ subagents: [{ agent: "Explore", task: "" }] }));
    expect(html).toContain("Explore");
    expect(html).not.toContain(">·</span>");
  });
});

describe("ToolCallRow 非 task 工具维持单行摘要", () => {
  test("subagents 为空的 task 调用回退 argsPreview 单行", () => {
    const html = renderRow(call({ subagents: [] }));
    expect(html).toContain("子智能体");
    expect(html).toContain("Explore");
    expect(html).not.toContain("text-link");
  });

  test.each([
    ["bash 读命令本体", "bash", "git status", "命令"],
    ["read", "read", "src/a.ts", "读取"],
    ["edit", "edit", "src/a.ts", "编辑"],
    ["write", "write", "src/a.ts", "写入"],
    ["grep 归搜索", "grep", "TODO", "搜索"],
    ["ls 归列目录", "ls", "src", "列目录"],
  ])("其他工具 %s：标签 + 参数摘要，无子智能体分段", (_name, tool, preview, label) => {
    const html = renderRow(call({ name: tool, argsPreview: preview, subagents: [] }));
    expect(html).toContain(label);
    expect(html).toContain(preview);
    expect(html).not.toContain("子智能体");
    expect(html).not.toContain("text-link");
  });

  test("未知工具不翻译：标签直接显示原始工具名", () => {
    const html = renderRow(call({ name: "mcp__x__y", argsPreview: "z", subagents: [] }));
    expect(html).toContain("mcp__x__y");
    expect(html).not.toContain("子智能体");
  });
});
