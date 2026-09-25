import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { FileCode2, FileText, Image as ImageIcon } from 'lucide-react-native';
import { PageHeader } from '@/components/navigation/page-header';
import { Card } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { SectionHeader } from '@/components/ui/section-header';
import { useAttachmentStore } from '@/store/attachment-store';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

const assets = [
  { id: 'asset-readme', name: 'README.md', detail: '2.4 KB · Markdown', icon: FileText, size: 2400, kind: 'document' as const },
  { id: 'asset-mobile', name: 'mobile.tsx', detail: '18.7 KB · TypeScript', icon: FileCode2, size: 18700, kind: 'document' as const },
  { id: 'asset-logo', name: 'pai-mark.png', detail: '96 KB · PNG', icon: ImageIcon, size: 96000, kind: 'image' as const },
] as const;

export default function AssetsRoute() {
  const { colors } = useAppTheme();
  const addAttachment = useAttachmentStore((state) => state.addAttachment);
  return <View style={{ backgroundColor: colors.background, flex: 1 }}><PageHeader title="项目文件" /><ScrollView contentContainerStyle={{ padding: spacing.xs3 }}><SectionHeader title="agent-app" /><Card style={{ marginTop: spacing.xs2 }}>{assets.map((asset) => <ListRow detail={asset.detail} icon={asset.icon} key={asset.id} label={asset.name} onPress={() => addAttachment({ id: asset.id, name: asset.name, size: asset.size, kind: asset.kind, status: 'ready', uri: `file:///project/${asset.name}` })} />)}</Card><Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: spacing.xs3 }}>点按文件即可附加到当前任务，附件会显示在输入框上方。</Text></ScrollView></View>;
}
