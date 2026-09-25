import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import * as React from 'react';
import { Bell, FileText, Search } from 'lucide-react-native';
import { PaiMark } from '@/components/brand/pai-mark';
import { ActionButton } from '@/components/ui/action-button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { ListRow } from '@/components/ui/list-row';
import { SectionHeader } from '@/components/ui/section-header';
import { TextField } from '@/components/ui/text-field';
import { ToggleRow } from '@/components/ui/toggle-row';
import { AttachmentChip } from '@/features/composer/attachment-chip';
import { DeviceRow } from '@/features/settings/device-row';
import { PrivacyProtectionRow } from '@/features/privacy/privacy-protection-row';
import { TestWrapper } from '@/test/test-wrapper';

describe('presentational components', () => {
  it('renders brand, card, header and empty state', async () => {
    const noop = jest.fn();
    const view = await render(<TestWrapper><PaiMark size={48} /><Card elevated><SectionHeader action="添加" onAction={noop} title="项目" /><EmptyState description="说明" icon={Search} title="空态" /></Card></TestWrapper>);
    expect(view.getByLabelText('Pai Code')).toBeTruthy();
    expect(view.getByText('空态')).toBeTruthy();
  });

  it('fires section and icon actions', async () => {
    const section = jest.fn();
    const icon = jest.fn();
    const view = await render(<><SectionHeader action="添加" onAction={section} title="项目" /><IconButton active filled icon={Bell} label="通知" onPress={icon} /></>);
    await fireEvent.press(view.getByText('添加'));
    await fireEvent.press(view.getByLabelText('通知'));
    expect(section).toHaveBeenCalledTimes(1);
    expect(icon).toHaveBeenCalledTimes(1);
  });

  it('renders list row variants and destructive action', async () => {
    const press = jest.fn();
    const view = await render(<><ListRow detail="路径" icon={FileText} label="文件" onPress={press} selected trailing="已选" /><ListRow destructive icon={FileText} label="删除" /></>);
    await fireEvent.press(view.getByText('文件'));
    expect(press).toHaveBeenCalledTimes(1);
    expect(view.getByText('删除').props.style.color).toBeTruthy();
  });

  it('edits a single and multiline text field', async () => {
    const single = jest.fn();
    const multi = jest.fn();
    const view = await render(<><TextField label="名称" onChangeText={single} /><TextField multiline onChangeText={multi} placeholder="内容" /></>);
    await fireEvent.changeText(view.getByLabelText('名称'), 'Pai');
    await fireEvent.changeText(view.getByPlaceholderText('内容'), '多行');
    expect(single).toHaveBeenCalledWith('Pai');
    expect(multi).toHaveBeenCalledWith('多行');
  });

  it('toggles row and action', async () => {
    const toggle = jest.fn();
    const action = jest.fn();
    const view = await render(<><ToggleRow detail="详情" label="通知" value onChange={toggle} /><ActionButton icon={FileText} label="打开" onPress={action} /></>);
    await fireEvent.press(view.getByLabelText('通知'));
    await fireEvent.press(view.getByText('打开'));
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('renders attachment status and removes it', async () => {
    const remove = jest.fn();
    const view = await render(<AttachmentChip attachment={{ id: '1', name: '设计.pdf', size: 2_000_000, kind: 'pdf', status: 'failed' }} onRemove={remove} />);
    expect(view.getByText('添加失败')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('移除 设计.pdf'));
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('renders device and privacy status', async () => {
    const view = await render(<><DeviceRow /><PrivacyProtectionRow /></>);
    expect(view.getByText('设备与连接')).toBeTruthy();
    expect(view.getByLabelText('隐私保护已启用')).toBeTruthy();
  });
});
