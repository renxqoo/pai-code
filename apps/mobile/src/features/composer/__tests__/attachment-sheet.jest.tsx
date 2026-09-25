import { act, fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as React from 'react';
import { FileText } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { AttachmentOption } from '@/components/composer/attachment-option';
import { AttachmentSheet } from '@/features/composer/attachment-sheet';
import { useAttachmentStore } from '@/store/attachment-store';
import { useNavigationStore } from '@/store/navigation-store';
import { TestWrapper } from '@/test/test-wrapper';

const mockDocumentPicker = jest.mocked(DocumentPicker);
const mockImagePicker = jest.mocked(ImagePicker);

describe('attachment sheet', () => {
  beforeEach(() => {
    mockDocumentPicker.getDocumentAsync.mockReset();
    mockImagePicker.launchImageLibraryAsync.mockReset();
    useAttachmentStore.setState({ items: [] });
    useNavigationStore.setState({ drawerOpen: false, sheet: null, tab: 'chat' });
  });

  it('fires an attachment option', async () => {
    const press = jest.fn();
    const view = await render(<AttachmentOption description="说明" icon={FileText} label="文件" onPress={press} />);
    await fireEvent.press(view.getByText('文件'));
    expect(press).toHaveBeenCalledTimes(1);
  });

  it('adds selected documents and closes', async () => {
    mockDocumentPicker.getDocumentAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file://a.pdf', name: 'a.pdf', size: 10 }] });
    await act(() => Promise.resolve(useNavigationStore.getState().openSheet('attachments')));
    const view = await render(<TestWrapper><AttachmentSheet /></TestWrapper>);
    await fireEvent.press(view.getByText('浏览文件'));
    expect(useAttachmentStore.getState().items).toHaveLength(1);
    expect(useNavigationStore.getState().sheet).toBeNull();
  });

  it('adds a project file', async () => {
    await act(() => Promise.resolve(useNavigationStore.getState().openSheet('attachments')));
    const view = await render(<TestWrapper><AttachmentSheet /></TestWrapper>);
    await fireEvent.press(view.getByText('从项目导入'));
    expect(useAttachmentStore.getState().items[0]?.name).toBe('README.md');
  });

  it('adds selected image and handles cancel', async () => {
    mockImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: true, assets: null }).mockResolvedValueOnce({ canceled: false, assets: [{ assetId: null, duration: null, fileName: 'i.png', fileSize: 20, height: 100, mimeType: 'image/png', type: 'image', uri: 'file://i.png', width: 100 }] });
    await act(() => Promise.resolve(useNavigationStore.getState().openSheet('attachments')));
    const view = await render(<TestWrapper><AttachmentSheet /></TestWrapper>);
    await fireEvent.press(view.getByText('从相册选择'));
    expect(useAttachmentStore.getState().items).toHaveLength(0);
    await act(() => Promise.resolve(useNavigationStore.getState().openSheet('attachments')));
    await view.rerender(<TestWrapper><AttachmentSheet /></TestWrapper>);
    await fireEvent.press(view.getByText('从相册选择'));
    expect(useAttachmentStore.getState().items[0]?.kind).toBe('image');
  });
});
