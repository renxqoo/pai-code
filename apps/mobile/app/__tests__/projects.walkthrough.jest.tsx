/**
 * 回归：项目页曾无条件渲染 fixture 里的内置假工作区（agent-app / X3code Mobile /
 * 产品文档 / 归档项目）——未连接电脑端时也照摆，看起来像真项目。
 * 候选真值只有一条：电脑端已有对话的目录。
 */
import { fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as React from 'react';
import ProjectsRoute from '../projects';
import { useConversationStore } from '@/store/conversation-store';
import { useHistoryStore } from '@/store/history-store';
import { testSession } from '@/test/session-fixture';
import { TestWrapper } from '@/test/test-wrapper';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

const FAKE_WORKSPACES = ['pai-mobile', 'Documents/Pai', 'Projects/archive', '归档项目'];

describe('项目页工作空间来源', () => {
  beforeEach(() => {
    useHistoryStore.setState({ sessions: [], query: '' });
    useConversationStore.getState().startNewSession();
    useConversationStore.setState({ workspaceId: null });
  });

  it('没有会话时不摆任何内置项目（症状：未连接也列出 4 个假工作区）', async () => {
    const view = await render(<TestWrapper><ProjectsRoute /></TestWrapper>);
    expect(view.getByText('还没有可用工作空间——连接电脑端后，这里会列出电脑端已有对话的目录。')).toBeTruthy();
    for (const fake of FAKE_WORKSPACES) {
      expect(view.queryByText(new RegExp(fake))).toBeNull();
    }
  });

  it('只列电脑端会话用过的 cwd，点选写回真路径', async () => {
    useHistoryStore.setState({
      sessions: [
        testSession('t1', { project: '/Users/wrr/work/agent-app' }),
        testSession('t2', { project: '/Users/wrr/work/agent-app' }),
        testSession('t3', { project: '/Users/wrr/Documents/Pai' }),
        testSession('t4', { project: '' }),
      ],
      query: '',
    });
    const view = await render(<TestWrapper><ProjectsRoute /></TestWrapper>);
    expect(view.getByText('agent-app')).toBeTruthy();
    expect(view.getByText('Pai')).toBeTruthy();
    // 去重：同一目录只出现一次
    expect(view.queryAllByText('agent-app')).toHaveLength(1);
    expect(view.queryByText('还没有可用工作空间——连接电脑端后，这里会列出电脑端已有对话的目录。')).toBeNull();
    await fireEvent.press(view.getByText('agent-app'));
    expect(useConversationStore.getState()).toMatchObject({ workspaceId: '/Users/wrr/work/agent-app', workspacePath: '/Users/wrr/work/agent-app' });
  });
});