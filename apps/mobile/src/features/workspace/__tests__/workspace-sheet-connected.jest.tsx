import { render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it } from '@jest/globals';
import * as React from 'react';

import { WorkspaceSheet } from '../workspace-sheet';
import { useNavigationStore } from '@/store/navigation-store';
import { useConversationStore } from '@/store/conversation-store';
import { useDemoModeStore } from '@/store/demo-mode-store';
import { initializeBridge } from '@/mobile/bridge-runtime';
import { TestWrapper } from '@/test/test-wrapper';
import { setBridgeStorageDriver } from '@/mobile/transport/bridge-storage';

describe('WorkspaceSheet（连接模式）', () => {
  beforeEach(() => {
    const map = new Map<string, string>();
    setBridgeStorageDriver({
      getItem: (key) => map.get(key) ?? null,
      setItem: (key, value) => map.set(key, value),
      removeItem: (key) => map.delete(key),
    });
    initializeBridge().disconnect();
    useDemoModeStore.getState().setEnabled(false);
    useNavigationStore.setState({ drawerOpen: false, sheet: null });
    useNavigationStore.getState().openSheet('workspace');
    useConversationStore.getState().startNewSession();
  });

  it('未连接（bridge 非 ready）：显示手动输入与浏览入口', async () => {
    const view = await render(<TestWrapper><WorkspaceSheet /></TestWrapper>);
    expect(view.getByLabelText('搜索项目目录')).toBeTruthy();
    expect(view.getByText('浏览电脑目录')).toBeTruthy();
  });

  it('浏览电脑目录入口存在（dialog/pickDirectory 触发口）', async () => {
    const view = await render(<TestWrapper><WorkspaceSheet /></TestWrapper>);
    expect(view.getByLabelText('浏览电脑目录，在电脑上打开目录选择器')).toBeTruthy();
  });
});
