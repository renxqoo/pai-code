import { fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as React from 'react';
import { AppearanceScreen } from '@/features/settings/appearance-screen';
import { PreferencesScreen } from '@/features/settings/preferences-screen';
import { SettingsScreen } from '@/features/settings/settings-screen';
import { useSettingsStore } from '@/store/settings-store';
import { useNavigationStore } from '@/store/navigation-store';
import { TestWrapper } from '@/test/test-wrapper';
import { SettingsCard } from '@/components/ui/settings-card';
import { CircleUserRound, HelpCircle } from 'lucide-react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));

describe('settings components', () => {
  beforeEach(() => {
    mockPush.mockClear();
    useNavigationStore.setState({ drawerOpen: false, sheet: null });
    useSettingsStore.setState({ theme: 'system', defaultModel: 'gpt-5.2-codex', defaultThinking: 'medium', defaultPermission: 'ask', notifications: true, haptics: true, compactHistory: false });
  });

  it('renders and changes appearance', async () => {
    const view = await render(<TestWrapper><AppearanceScreen /></TestWrapper>);
    await fireEvent.press(view.getByText('深色'));
    expect(useSettingsStore.getState().theme).toBe('dark');
    expect(view.queryByText('紧凑历史列表')).toBeNull();
  });

  it('renders preferences and navigates to models', async () => {
    const view = await render(<TestWrapper><PreferencesScreen /></TestWrapper>);
    await fireEvent.press(view.getByText('默认模型'));
    await fireEvent.press(view.getByText('默认思考强度'));
    await fireEvent.press(view.getByText('高'));
    await fireEvent.press(view.getByText('默认权限模式'));
    await fireEvent.press(view.getByText('仅规划'));
    await fireEvent.press(view.getByLabelText('通知与提醒'));
    await fireEvent.press(view.getByLabelText('触感反馈'));
    await fireEvent.press(view.getByLabelText('紧凑历史列表'));
    expect(mockPush).toHaveBeenCalledWith('/models');
    expect(useSettingsStore.getState()).toMatchObject({ notifications: false, haptics: false, compactHistory: true, defaultThinking: 'high', defaultPermission: 'plan' });
  });

  it('renders concise settings navigation without duplicated controls', async () => {
    const view = await render(<TestWrapper><SettingsScreen /></TestWrapper>);
    expect(view.getByText('设置')).toBeTruthy();
    expect(view.getByLabelText('返回')).toBeTruthy();
    expect(view.getByText('偏好设置')).toBeTruthy();
    expect(view.getByText('外观')).toBeTruthy();
    expect(view.queryByLabelText('通知')).toBeNull();
    expect(view.queryByLabelText('触感反馈')).toBeNull();
    expect(view.getByTestId('settings-scroll').props.contentContainerStyle).toMatchObject({ paddingTop: 59 });
    expect(view.getByTestId('settings-scroll').props.style).toMatchObject({ backgroundColor: '#F6F6F7' });
  });

  it('navigates unified settings rows', async () => {
    const view = await render(<SettingsCard items={[{ label: '资料', detail: '详情', href: '/profile', icon: CircleUserRound }, { label: '帮助', detail: '详情', href: '/help', icon: HelpCircle }]} />);
    await fireEvent.press(view.getByText('资料'));
    await fireEvent.press(view.getByText('帮助'));
    expect(mockPush).toHaveBeenNthCalledWith(1, '/profile');
    expect(mockPush).toHaveBeenNthCalledWith(2, '/help');
  });
});
