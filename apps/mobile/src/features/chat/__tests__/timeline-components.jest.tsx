import { fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it } from "@jest/globals";
import * as React from "react";
import { ActivityBlock } from "@/features/chat/activity-block";
import { CodeBlock } from "@/features/chat/code-block";
import { MessageItem } from "@/features/chat/message-item";
import { ExecutionTodoRow } from "@/features/chat/execution-todo-row";
import { formatTimelineDuration } from "@/features/chat/timeline-duration";
import type { ChatMessage } from "@/types/domain";

type MessageValues = Pick<ChatMessage, "id" | "kind" | "text"> &
  Partial<Omit<ChatMessage, "id" | "kind" | "text">>;
const message = (values: MessageValues): ChatMessage => ({ createdAt: "now", ...values });

describe("timeline components", () => {
  it("renders user, assistant, system and code content messages", async () => {
    const view = await render(
      <>
        <MessageItem message={message({ id: "user", kind: "user", text: "用户" })} />
        <MessageItem message={message({ id: "assistant", kind: "assistant", text: "助手" })} />
        <MessageItem message={message({ id: "system", kind: "system", text: "系统" })} />
        <MessageItem message={message({ id: "code", kind: "code", text: "代码内容" })} />
      </>,
    );
    expect(view.getByText("用户")).toBeTruthy();
    const card = view.getByTestId("user-task-card");
    expect(card.props.style).toMatchObject({ borderRadius: 14, alignItems: "flex-end", maxWidth: "86%" });
    expect(card.props.style.borderBottomRightRadius).toBeUndefined();
    expect(card.parent?.props.style).toMatchObject({ alignItems: "flex-end" });
    expect(view.getByText("用户").props.style).toMatchObject({ textAlign: "right" });
    expect(view.getByText("助手")).toBeTruthy();
    expect(view.getByText("系统")).toBeTruthy();
    expect(view.getByText("代码内容")).toBeTruthy();
  });

  it("keeps successful activity folded and reveals mixed details in original order", async () => {
    const block = {
      kind: "activity" as const,
      key: "activity",
      messages: [
        message({ id: "think-1", kind: "thinking", text: "先检查消息模型" }),
        message({
          id: "tool-1",
          kind: "tool",
          title: "读取文件",
          text: "读取完整内容",
          summary: "读取 3 个文件",
          status: "success",
          durationMs: 500,
        }),
        message({
          id: "status-1",
          kind: "status",
          text: "检查完成",
          summary: "0 个错误",
          status: "success",
          durationMs: 700,
        }),
      ],
    };
    const view = await render(<ActivityBlock block={block} />);
    const control = view.getByLabelText("展开活动详情：已完成 3 项活动");
    expect(control.props.accessibilityState).toEqual({ expanded: false });
    expect(view.getByText("已完成 3 项活动")).toBeTruthy();
    expect(view.getByText("0 个错误")).toBeTruthy();
    expect(view.queryByText("先检查消息模型")).toBeNull();
    await fireEvent.press(control);
    expect(view.getByText("先检查消息模型")).toBeTruthy();
    expect(view.getByText("读取文件")).toBeTruthy();
    expect(view.getByText("检查完成")).toBeTruthy();
  });

  it("truncates long code, expands and collapses with fallback metadata", async () => {
    const view = await render(<CodeBlock code={'1\n2\n3\n4\n5\n6\n7'} />);
    expect(view.getByText("代码")).toBeTruthy();
    expect(view.getByText("text")).toBeTruthy();
    expect(view.getByText("展开剩余 2 行")).toBeTruthy();
    await fireEvent.press(view.getByText("代码"));
    expect(view.getByText("收起代码")).toBeTruthy();
    await fireEvent.press(view.getByText("收起代码"));
    expect(view.getByText("展开剩余 2 行")).toBeTruthy();
    const short = await render(<CodeBlock code="only" language="ts" lineCount={1} title="app.ts" />);
    expect(short.queryByText(/展开剩余/)).toBeNull();
  });

  it("shows running activity as one folded current-action summary", async () => {
    const running = {
      kind: "activity" as const,
      key: "running",
      messages: [
        message({ id: "thinking-before", kind: "thinking", text: "先定位测试入口" }),
        message({
          id: "done-tool",
          kind: "tool",
          title: "读取文件",
          text: "完成",
          status: "success",
        }),
        message({ id: "thinking-between", kind: "thinking", text: "继续检查失败用例" }),
        message({
          id: "running-tool",
          kind: "tool",
          title: "运行测试",
          text: "测试进行中",
          summary: "12 / 18",
          status: "running",
        }),
      ],
    };
    const view = await render(<ActivityBlock block={running} />);
    expect(view.getByText("正在执行 · 运行测试")).toBeTruthy();
    expect(view.getByText("12 / 18")).toBeTruthy();
    expect(view.getByText("1 / 2")).toBeTruthy();
    expect(view.queryByText("1 / 4")).toBeNull();
    expect(view.queryByText("读取文件")).toBeNull();
    expect(view.getByLabelText("展开活动详情：正在执行 · 运行测试").props.accessibilityState).toEqual({
      expanded: false,
    });
  });

  it("opens failed activity by default and exposes the failed detail", async () => {
    const failed = {
      kind: "activity" as const,
      key: "failed",
      messages: [
        message({
          id: "done-tool",
          kind: "tool",
          title: "读取配置",
          text: "完成",
          status: "success",
        }),
        message({
          id: "failed-tool",
          kind: "tool",
          title: "运行测试",
          text: "两个断言失败",
          summary: "2 tests failed",
          status: "error",
          durationMs: 1200,
        }),
      ],
    };
    const view = await render(<ActivityBlock block={failed} />);
    expect(view.getByText("执行遇到问题")).toBeTruthy();
    expect(view.getByText("2 tests failed")).toBeTruthy();
    expect(view.getByText("两个断言失败")).toBeTruthy();
    expect(view.getAllByText("1.2s")).toHaveLength(2);
    const control = view.getByLabelText("收起活动详情：执行遇到问题");
    expect(control.props.accessibilityState).toEqual({ expanded: true });
    await fireEvent.press(control);
    expect(view.getByText("2 tests failed")).toBeTruthy();
    expect(view.queryByText("两个断言失败")).toBeNull();
  });

  it("uses safe activity fallbacks for blank metadata and invalid duration", async () => {
    const block = {
      kind: "activity" as const,
      key: "fallback",
      messages: [
        message({
          id: "blank-tool",
          kind: "tool",
          title: "   ",
          text: "",
          status: "success",
          durationMs: Number.NaN,
        }),
      ],
    };
    const view = await render(<ActivityBlock block={block} />);
    const control = view.getByLabelText("展开活动详情：已完成 1 项活动");
    expect(view.queryByText("0ms")).toBeNull();
    await fireEvent.press(control);
    expect(view.getByText("执行操作")).toBeTruthy();
  });

  it("renders failed execution steps with a warning state", async () => {
    const view = await render(
      <ExecutionTodoRow
        todo={{ id: "failed", title: "测试失败", detail: "修复后重试", state: "failed" }}
      />,
    );
    expect(view.getByText("测试失败")).toBeTruthy();
  });

  it("formats duration boundaries and garbage values safely", () => {
    expect(formatTimelineDuration(Number.NaN)).toBe("0ms");
    expect(formatTimelineDuration(Number.POSITIVE_INFINITY)).toBe("0ms");
    expect(formatTimelineDuration(-10)).toBe("0ms");
    expect(formatTimelineDuration(999)).toBe("999ms");
    expect(formatTimelineDuration(1500)).toBe("1.5s");
    expect(formatTimelineDuration(12_000)).toBe("12s");
  });
});
