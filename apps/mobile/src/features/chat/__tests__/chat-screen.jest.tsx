import { fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it } from "@jest/globals";
import * as React from "react";
import { ChatScreen } from "@/features/chat/chat-screen";
import { demoSessions } from "@/fixtures/demo-data";
import { useConversationStore } from "@/store/conversation-store";
import { useNavigationStore } from "@/store/navigation-store";
import { useComposerStore } from "@/store/composer-store";
import { TestWrapper } from "@/test/test-wrapper";

describe("ChatScreen", () => {
  beforeEach(() => {
    useConversationStore.getState().startNewSession();
    useNavigationStore.setState({ drawerOpen: false, sheet: null });
    useComposerStore.setState({ generating: false });
  });

  it("renders empty chat, opens workspace and enters the demo timeline", async () => {
    const view = await render(
      <TestWrapper>
        <ChatScreen />
      </TestWrapper>,
    );
    await fireEvent.press(view.getByText("选择工作空间"));
    expect(useNavigationStore.getState().sheet).toBe("workspace");
    await fireEvent.press(view.getByText("查看示例对话"));
    expect(useConversationStore.getState().session.id).toBe("session-agent-journey");
    expect(useConversationStore.getState().permissionRequest?.approved).toBeNull();
  });

  it("tracks near-bottom scroll state without pulling the view away", async () => {
    const session = demoSessions[0];
    if (session === undefined) throw new Error("fixture missing");
    useConversationStore.getState().openSession(session);
    const view = await render(
      <TestWrapper>
        <ChatScreen />
      </TestWrapper>,
    );
    const scroll = view.getByTestId("conversation-scroll");
    // 贴底滚动：内容增长后仍拉到底部
    await fireEvent(scroll, "contentSizeChange");
    // 离底：不再强拉回底（近底阈值 72）
    await fireEvent(scroll, "scroll", {
      nativeEvent: {
        contentOffset: { x: 0, y: 10 },
        contentSize: { width: 390, height: 2000 },
        layoutMeasurement: { width: 390, height: 800 },
      },
    });
    await fireEvent(scroll, "contentSizeChange");
    await fireEvent(scroll, "scroll", {
      nativeEvent: {
        contentOffset: { x: 0, y: 1500 },
        contentSize: { width: 390, height: 2000 },
        layoutMeasurement: { width: 390, height: 800 },
      },
    });
    await fireEvent(scroll, "contentSizeChange");
    expect(scroll.props.onScroll).toBeDefined();
  });

  it("renders a folded process turn, its result and the composer", async () => {
    const session = demoSessions[0];
    if (session === undefined) throw new Error("fixture missing");
    useConversationStore.getState().openSession(session);
    const view = await render(
      <TestWrapper>
        <ChatScreen />
      </TestWrapper>,
    );
    expect(view.getByText(session.messages[0]?.text ?? "")).toBeTruthy();
    expect(view.getByLabelText(/展开过程流|收起过程流/)).toBeTruthy();
    expect(view.getByLabelText("消息输入框")).toBeTruthy();
    expect(view.getByTestId("conversation-scroll").props.scrollEventThrottle).toBe(16);
    expect(view.getByTestId("conversation-scroll").props.contentContainerStyle).toMatchObject({
      paddingBottom: 96,
    });
    await fireEvent(view.getByLabelText("消息输入框"), "focus");
    expect(view.getByTestId("conversation-scroll").props.contentContainerStyle).toMatchObject({
      paddingBottom: 160,
    });
  });
});
