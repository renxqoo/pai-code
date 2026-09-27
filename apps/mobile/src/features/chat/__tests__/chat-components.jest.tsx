import { act, fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as React from "react";
import { demoSessions } from "@/fixtures/demo-data";
import { ChatHeader } from "@/features/chat/chat-header";
import { EmptyChat } from "@/features/chat/empty-chat";
import { TurnLoadingRow } from "@/features/chat/turn-loading-row";
import { PermissionCard } from "@/features/chat/permission-card";
import { TimelineList } from "@/features/chat/timeline-list";
import { SessionRow } from "@/features/history/session-row";
import { WorkspaceSheet } from "@/features/workspace/workspace-sheet";
import { useConversationStore } from "@/store/conversation-store";
import { useNavigationStore } from "@/store/navigation-store";
import { TestWrapper } from "@/test/test-wrapper";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

describe("chat and history components", () => {
  beforeEach(() => {
    useNavigationStore.setState({ drawerOpen: false, sheet: null });
    useConversationStore.getState().startNewSession();
  });

  it("renders user attachments, assistant text, code preview and status rows", async () => {
    const session = demoSessions[1];
    if (session === undefined) throw new Error("fixture missing");
    const view = await render(<TimelineList generating={false} messages={session.messages} />);
    await fireEvent.press(view.getByLabelText(/展开过程流/));
    expect(view.getByText("ComposerPanel.tsx")).toBeTruthy();
    await fireEvent.press(view.getByText("ComposerPanel.tsx"));
    expect(view.getByText("5 个页面，0 个错误")).toBeTruthy();
    expect(view.getByText("已完成移动端视觉走查")).toBeTruthy();
    const release = demoSessions[2];
    if (release === undefined) throw new Error("fixture missing");
    await view.rerender(<TimelineList generating={false} messages={release.messages} />);
    expect(view.getByText("Android 权限检查失败")).toBeTruthy();
  });

  it("执行中指示贴消息流末尾、最后一条消息后面且不固定悬浮（用户裁决：与 PC 对话列表同实现）", async () => {
    const view = await render(
      <TimelineList generating messages={[{ id: "u1", kind: "user", text: "最后一条消息", createdAt: "now" }]} />,
    );
    const order = JSON.stringify(view.toJSON());
    // 贴在最后一条消息后面：不浮到屏幕最底部，也不进头部
    expect(order.indexOf("Pai Code 正在生成回复")).toBeGreaterThan(order.indexOf("最后一条消息"));
    // 不固定：样式里没有任何 position 定位（随消息流滚动）
    const row = view.getByLabelText("Pai Code 正在生成回复");
    const styles = (Array.isArray(row.props.style) ? row.props.style : [row.props.style]) as readonly { position?: string }[];
    expect(styles.every((entry) => entry?.position === undefined)).toBe(true);
    // 未生成不渲染
    const idle = await render(<TimelineList generating={false} messages={[]} />);
    expect(idle.queryByLabelText("Pai Code 正在生成回复")).toBeNull();
  });

  it("执行中指示视觉本体只有旋转指示（与 PC 同形态）：无可见文案，语义靠读屏；全应用唯一旋转 loading 在这里", async () => {
    const view = await render(<TurnLoadingRow />);
    expect(view.getByLabelText("Pai Code 正在生成回复")).toBeTruthy();
    expect(view.queryByText(/正在生成/)).toBeNull();
    expect(view.getAllByTestId("loading-spinner", { includeHiddenElements: true })).toHaveLength(1);
  });

  it("opens empty workspace, demo conversation and quick prompts", async () => {
    const workspace = jest.fn();
    const prompt = jest.fn();
    const demo = jest.fn();
    const view = await render(
      <>
        <EmptyChat onDemo={demo} onPrompt={prompt} onWorkspace={workspace} />
        <PermissionCard />
      </>,
    );
    await fireEvent.press(view.getByText("选择工作空间"));
    expect(workspace).toHaveBeenCalledTimes(1);
    await fireEvent.press(view.getByText("查看示例对话"));
    expect(demo).toHaveBeenCalledTimes(1);
    await fireEvent.press(view.getByText("分析当前项目"));
    await fireEvent.press(view.getByText("定位并修复问题"));
    await fireEvent.press(view.getByText("审查代码质量"));
    expect(prompt).toHaveBeenNthCalledWith(
      1,
      "分析当前项目结构、关键模块和潜在风险，并给出可执行改进计划。",
    );
    expect(prompt).toHaveBeenNthCalledWith(
      2,
      "定位当前项目中的错误或失败测试，分析根因并完成修复。",
    );
    expect(prompt).toHaveBeenNthCalledWith(3, "审查当前代码变更，检查正确性、安全性和可维护性。");
    await act(() =>
      Promise.resolve(
        useConversationStore
          .getState()
          .requestPermission({ id: "p", title: "运行测试", command: "bun test", approved: null }),
      ),
    );
    await view.rerender(<PermissionCard />);
    await fireEvent.press(view.getByText("允许一次"));
    expect(useConversationStore.getState().permissionRequest?.approved).toBe(true);
  });

  it("renders chat header and opens history/task configuration", async () => {
    const view = await render(<ChatHeader />);
    await fireEvent.press(view.getByLabelText("打开对话历史"));
    expect(useNavigationStore.getState().drawerOpen).toBe(true);
    await fireEvent.press(view.getByLabelText("任务配置"));
    expect(useNavigationStore.getState().sheet).toBe("task-config");
  });

  it("opens and manages a session row", async () => {
    const session = demoSessions[1];
    if (session === undefined) throw new Error("fixture missing");
    const open = jest.fn();
    const action = jest.fn();
    const view = await render(
      <SessionRow active onAction={action} onOpen={open} session={session} />,
    );
    expect(view.getByLabelText(session.title).props.accessibilityState).toEqual({ selected: true });
    await fireEvent.press(view.getByLabelText(session.title));
    await fireEvent.press(view.getByLabelText(`${session.title} 更多操作`));
    expect(open).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("shows closed conversation states without duplicate unread markers", async () => {
    const unread = demoSessions[1];
    if (unread === undefined) throw new Error("fixture missing");
    const workingUnread = { ...unread, state: "working" as const };
    const pausedUnread = { ...unread, id: "paused-unread", state: "paused" as const };
    const view = await render(<><SessionRow onAction={jest.fn()} onOpen={jest.fn()} session={workingUnread} /><SessionRow onAction={jest.fn()} onOpen={jest.fn()} session={pausedUnread} /></>);
    expect(view.getByText("进行中")).toBeTruthy();
    expect(view.getByText("需要处理")).toBeTruthy();
    expect(view.queryByLabelText("未读")).toBeNull();
    await view.rerender(<SessionRow onAction={jest.fn()} onOpen={jest.fn()} session={unread} />);
    expect(view.getByLabelText("未读")).toBeTruthy();
  });

  it("shows workspace options and selects one", async () => {
    useNavigationStore.getState().openSheet("workspace");
    const view = await render(
      <TestWrapper>
        <WorkspaceSheet />
      </TestWrapper>,
    );
    await fireEvent.press(view.getByText("Pai Mobile"));
    expect(useNavigationStore.getState().sheet).toBeNull();
    expect(useConversationStore.getState()).toMatchObject({ workspaceId: "workspace-mobile" });
  });
});
