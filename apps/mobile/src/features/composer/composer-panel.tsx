import * as React from 'react';
import { TextInput, View } from 'react-native';
import { useAppTheme } from '@/theme/theme-context';
import { layout, radius, spacing } from '@/theme/tokens';
import { useAttachmentStore } from '@/store/attachment-store';
import { useComposerStore } from '@/store/composer-store';
import { AttachmentChip } from '@/features/composer/attachment-chip';
import { ComposerToolbar } from '@/features/composer/composer-toolbar';

export function ComposerPanel() {
  const { colors } = useAppTheme();
  const draft = useComposerStore((state) => state.draft);
  const setDraft = useComposerStore((state) => state.setDraft);
  const items = useAttachmentStore((state) => state.items);
  const removeAttachment = useAttachmentStore((state) => state.removeAttachment);
  return (
    <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, marginHorizontal: spacing.xs3, paddingBottom: 6, shadowColor: '#000000', shadowOffset: { height: 5, width: 0 }, shadowOpacity: 0.07, shadowRadius: 18, elevation: 3, marginBottom: spacing.sm, minHeight: layout.composerMinHeight }}>
      {items.length > 0 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingTop: spacing.sm }}>{items.map((item) => <AttachmentChip attachment={item} key={item.id} onRemove={() => removeAttachment(item.id)} />)}</View> : null}
      <TextInput
        accessibilityLabel="消息输入框"
        multiline
        onChangeText={setDraft}
        placeholder="描述任务，或粘贴代码和错误信息…"
        placeholderTextColor={colors.textFaint}
        style={{ color: colors.text, flex: 1, fontSize: 15, lineHeight: 21, maxHeight: 132, minHeight: 58, paddingHorizontal: 13, paddingTop: 12 }}
        value={draft}
      />
      <ComposerToolbar />
    </View>
  );
}
