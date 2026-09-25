import { fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as React from 'react';
import { AppearanceScreen } from '@/features/settings/appearance-screen';
import { PreferencesScreen } from '@/features/settings/preferences-screen';
import { SettingsScreen } from '@/features/settings/settings-screen';
import { SettingFooterLink } from '@/components/ui/setting-footer-link';
import { SettingNavigationRow } from '@/components/ui/setting-navigation-row';
import { useSettingsStore } from '@/store/settings-store';
import { TestWrapper } from '@/test/test-wrapper';
import { HelpCircle } from 'lucide-react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));

describe('settings components', () => {
  beforeEach(() => {
    mockPush.mockClear();
    useSettingsStore.setState({ theme: 'system', defaultModel: 'gpt-5.2-codex', defaultThinking: 'medium', defaultPermission: 'ask', notifications: true, haptics: true, compactHistory: false });
  });

  it('renders and changes appearance', async () => {
    const view = await render(<TestWrapper><AppearanceScreen /></TestWrapper>);
    await fireEvent.press(view.getByText('深色'));
    expect(useSettingsStore.getState().theme).toBe('dark');
  });

  it('renders preferences and navigates to models', async () => {
    const view = await render(<TestWrapper><PreferencesScreen /></TestWrapper>);
    await fireEvent.press(view.getByText('默认模型'));
    await fireEvent.press(view.getByLabelText('通知与提醒'));
    await fireEvent.press(view.getByLabelText('触感反馈'));
    await fireEvent.press(view.getByLabelText('紧凑历史列表'));
    expect(mockPush).toHaveBeenCalledWith('/models');
    expect(useSettingsStore.getState()).toMatchObject({ notifications: false, haptics: false, compactHistory: true });
  });

  it('renders main settings and toggles preferences', async () => {
    const view = await render(<TestWrapper><SettingsScreen /></TestWrapper>);
    await fireEvent.press(view.getByLabelText('通知'));
    await fireEvent.press(view.getByLabelText('触感反馈'));
    expect(useSettingsStore.getState()).toMatchObject({ notifications: false, haptics: false });
  });

  it('navigates rows and footer links', async () => {
    const view = await render(<><SettingNavigationRow detail="详情" href="/profile" icon={HelpCircle} label="资料" /><SettingFooterLink detail="详情" href="/help" icon={HelpCircle} label="帮助" /></>);
    await fireEvent.press(view.getByText('资料'));
    await fireEvent.press(view.getByText('帮助'));
    expect(mockPush).toHaveBeenNthCalledWith(1, '/profile');
    expect(mockPush).toHaveBeenNthCalledWith(2, '/help');
  });
});
