import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import * as React from 'react';
import { Bell, FileText, Search } from 'lucide-react-native';
import { PaiMark } from '@/components/brand/pai-mark';
import { ActionButton } from '@/components/ui/action-button';
import { Card } from '@/components/ui/card';
import { ContentCard } from '@/components/ui/content-card';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { SectionHeader } from '@/components/ui/section-header';
import { TextField } from '@/components/ui/text-field';
import { ToggleRow } from '@/components/ui/toggle-row';
import { AttachmentChip } from '@/features/composer/attachment-chip';
import { PrivacyProtectionRow } from '@/features/privacy/privacy-protection-row';
import { TestWrapper } from '@/test/test-wrapper';

describe('presentational components', () => {
  it('renders brand, card, header and empty state', async () => {
    const noop = jest.fn();
    const view = await render(<TestWrapper><PaiMark size={48} /><Card><SectionHeader action="添加" onAction={noop} title="项目" /><EmptyState description="说明" icon={Search} title="空态" /></Card></TestWrapper>);
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

  it('renders interactive, static, trailing and selected content rows', async () => {
    const press = jest.fn();
    const selectedPress = jest.fn();
    const view = await render(<ContentCard items={[{ detail: '详情', icon: FileText, label: '可点击', onPress: press }, { label: '只读' }, { label: '状态', trailing: '进行中' }, { label: '已选', onPress: selectedPress, selected: true, trailing: '不可见状态' }]} />);
    expect(view.getByText('可点击')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('可点击，详情'));
    expect(press).toHaveBeenCalledTimes(1);
    expect(view.getByText('只读')).toBeTruthy();
    expect(view.getByText('进行中')).toBeTruthy();
    expect(view.getByText('已选')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('已选'));
    expect(selectedPress).toHaveBeenCalledTimes(1);
  });

  it('renders padded content cards', async () => {
    const view = await render(<ContentCard items={[{ label: '统计' }]} padded />);
    expect(view.getByText('统计')).toBeTruthy();
  });

  it('renders privacy status', async () => {
    const view = await render(<PrivacyProtectionRow />);
    expect(view.getByLabelText('隐私保护已启用')).toBeTruthy();
  });
});
