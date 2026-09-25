import { act, fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as React from 'react';
import { demoSessions } from '@/fixtures/demo-data';
import { ChatHeader } from '@/features/chat/chat-header';
import { EmptyChat } from '@/features/chat/empty-chat';
import { PermissionCard } from '@/features/chat/permission-card';
import { TimelineList } from '@/features/chat/timeline-list';
import { SessionRow } from '@/features/history/session-row';
import { WorkspaceSheet } from '@/features/workspace/workspace-sheet';
import { useConversationStore } from '@/store/conversation-store';
import { useNavigationStore } from '@/store/navigation-store';
import { TestWrapper } from '@/test/test-wrapper';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

describe('chat and history components', () => {
  beforeEach(() => {
    useNavigationStore.setState({ drawerOpen: false, sheet: null });
    useConversationStore.getState().startNewSession();
  });

  it('renders user attachments, assistant text, code preview and status rows', async () => {
    const session = demoSessions[1];
    if (session === undefined) throw new Error('fixture missing');
    const view = await render(<TimelineList generating={false} messages={session.messages} />);
    expect(view.getByText('ComposerPanel.tsx')).toBeTruthy();
    await fireEvent.press(view.getByText('ComposerPanel.tsx'));
    expect(view.getByText('已完成移动端视觉走查')).toBeTruthy();
    const release = demoSessions[2];
    if (release === undefined) throw new Error('fixture missing');
    await view.rerender(<TimelineList generating={false} messages={release.messages} />);
    expect(view.getByText('Android 权限检查失败')).toBeTruthy();
  });

  it('opens empty workspace, demo conversation and quick prompts', async () => {
    const workspace = jest.fn();
    const prompt = jest.fn();
    const demo = jest.fn();
    const view = await render(<><EmptyChat onDemo={demo} onPrompt={prompt} onWorkspace={workspace} /><PermissionCard /></>);
    await fireEvent.press(view.getByText('选择工作空间'));
    expect(workspace).toHaveBeenCalledTimes(1);
    await fireEvent.press(view.getByText('查看示例对话'));
    expect(demo).toHaveBeenCalledTimes(1);
    await fireEvent.press(view.getByText('分析当前项目'));
    await fireEvent.press(view.getByText('定位并修复问题'));
    await fireEvent.press(view.getByText('审查代码质量'));
    expect(prompt).toHaveBeenNthCalledWith(1, '分析当前项目结构、关键模块和潜在风险，并给出可执行改进计划。');
    expect(prompt).toHaveBeenNthCalledWith(2, '定位当前项目中的错误或失败测试，分析根因并完成修复。');
    expect(prompt).toHaveBeenNthCalledWith(3, '审查当前代码变更，检查正确性、安全性和可维护性。');
    await act(() => Promise.resolve(useConversationStore.getState().requestPermission({ id: 'p', title: '运行测试', command: 'bun test', approved: null })));
    await view.rerender(<PermissionCard />);
    await fireEvent.press(view.getByText('允许一次'));
    expect(useConversationStore.getState().permissionRequest?.approved).toBe(true);
  });

  it('renders chat header and opens history/task configuration', async () => {
    const view = await render(<ChatHeader />);
    await fireEvent.press(view.getByLabelText('打开对话历史'));
    expect(useNavigationStore.getState().drawerOpen).toBe(true);
    await fireEvent.press(view.getByLabelText('任务配置'));
    expect(useNavigationStore.getState().sheet).toBe('task-config');
  });

  it('opens and manages a session row', async () => {
    const session = demoSessions[1];
    if (session === undefined) throw new Error('fixture missing');
    const open = jest.fn();
    const action = jest.fn();
    const view = await render(<SessionRow onAction={action} onOpen={open} session={session} />);
    await fireEvent.press(view.getByLabelText(session.title));
    await fireEvent.press(view.getByLabelText(`${session.title} 更多操作`));
    expect(open).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('shows workspace options and selects one', async () => {
    useNavigationStore.getState().openSheet('workspace');
    const view = await render(<TestWrapper><WorkspaceSheet /></TestWrapper>);
    await fireEvent.press(view.getByText('Pai Mobile'));
    expect(useNavigationStore.getState().sheet).toBeNull();
    expect(useConversationStore.getState()).toMatchObject({ workspaceId: 'workspace-mobile' });
  });
});
