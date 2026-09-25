import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { FileText, Image as ImageIcon, X } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';
import type { Attachment } from '@/types/domain';

type AttachmentChipProps = { attachment: Attachment; onRemove?: () => void };

export function AttachmentChip({ attachment, onRemove }: AttachmentChipProps) {
  const { colors } = useAppTheme();
  const Icon = attachment.kind === 'image' ? ImageIcon : FileText;
  const size = attachment.size >= 1_000_000 ? `${(attachment.size / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(attachment.size / 1000))} KB`;
  return (
    <View style={{ alignItems: 'center', backgroundColor: colors.surfaceSubtle, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', maxWidth: 220, paddingLeft: 10, paddingVertical: 8 }}>
      <Icon color={attachment.status === 'failed' ? colors.destructive : colors.textMuted} size={18} />
      <View style={{ flex: 1, marginLeft: spacing.sm }}>
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>{attachment.name}</Text>
        <Text style={{ color: attachment.status === 'failed' ? colors.destructive : colors.textFaint, fontSize: 10, marginTop: 2 }}>{attachment.status === 'failed' ? '添加失败' : `${size} · ${attachment.kind}`}</Text>
      </View>
      {onRemove ? <Pressable accessibilityLabel={`移除 ${attachment.name}`} hitSlop={8} onPress={onRemove} style={{ padding: 8 }}><X color={colors.textMuted} size={16} /></Pressable> : null}
    </View>
  );
}
