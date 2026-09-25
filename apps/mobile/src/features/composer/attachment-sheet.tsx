import * as React from 'react';
import { View } from 'react-native';
import { FileText, FolderOpen, Image as ImageIcon } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { spacing } from '@/theme/tokens';
import { Sheet } from '@/components/ui/sheet';
import { AttachmentOption } from '@/components/composer/attachment-option';
import { useAttachmentStore } from '@/store/attachment-store';
import { useNavigationStore } from '@/store/navigation-store';
import { kindOf } from '@/features/composer/attachment-kind';

export function AttachmentSheet() {
  const open = useNavigationStore((state) => state.sheet === 'attachments');
  const closeSheet = useNavigationStore((state) => state.closeSheet);
  const addAttachment = useAttachmentStore((state) => state.addAttachment);
  const addProjectFile = () => { addAttachment({ id: 'project-readme', name: 'README.md', size: 2400, kind: 'document', status: 'ready', uri: 'file:///project/README.md' }); closeSheet(); };
  const addImage = async () => { const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 }); closeSheet(); if (!result.canceled && result.assets[0]) addAttachment({ id: result.assets[0].assetId ?? result.assets[0].uri, name: result.assets[0].fileName ?? '照片.jpg', size: result.assets[0].fileSize ?? 0, kind: 'image', status: 'ready', uri: result.assets[0].uri }); };
  const addDocument = async () => { const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true }); closeSheet(); if (!result.canceled) result.assets.forEach((asset) => addAttachment({ id: asset.uri, name: asset.name, size: asset.size ?? 0, kind: kindOf(asset.name), status: 'ready', uri: asset.uri })); };
  return <Sheet onClose={closeSheet} title="添加附件" visible={open}><View style={{ gap: spacing.sm, paddingBottom: spacing.xs3 }}><AttachmentOption description="图片、代码文件、文档与 PDF" icon={ImageIcon} label="从相册选择" onPress={() => { void addImage(); }} /><AttachmentOption description="支持多选，文件仅用于当前任务" icon={FolderOpen} label="浏览文件" onPress={() => { void addDocument(); }} /><AttachmentOption description="添加当前工作空间中的 README.md" icon={FileText} label="从项目导入" onPress={addProjectFile} /></View></Sheet>;
}
